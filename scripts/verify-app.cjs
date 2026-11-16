/* Run against a built app. All writes go ONLY to cabtrack_checks_test. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { request, expect } = require('@playwright/test');
const XLSX = require('xlsx');
const { environment, HTTP_BASE, HTTPS_BASE, SHELL_BASE, TEST_PIN } = require('./test-environment.cjs');

const NEW_PIN = '007531';
const FINAL_PIN = '063219';
const results = [];
const clients = [];
async function check(name, fn) {
  await fn();
  results.push({ name, passed: true });
  console.log(`[${String(results.length).padStart(2, '0')}] PASS ${name}`);
}
async function json(res, status = 200) {
  assert.equal(res.status(), status, `Unexpected HTTP status ${res.status()} (expected ${status})`);
  return res.json();
}
function ist() {
  const d = new Date();
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
  const [h,m] = time.split(':').map(Number);
  return { date, m: h * 60 + m };
}
const tm = n => { n = (n + 1440) % 1440; return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`; };

(async () => {
  const env = await environment();
  let failed = null;
  const api = await request.newContext({ baseURL: HTTP_BASE }); clients.push(api);
  const anonymous = await request.newContext({ baseURL: HTTP_BASE }); clients.push(anonymous);
  const browserErrors = [];
  const context = await env.context();
  const page = await context.newPage();
  page.on('pageerror', e => browserErrors.push(e.message));
  const pinPanel = () => page.getByTestId('admin-pin-settings');
  let recovery;
  let driverKey;
  let cab;
  let driverId;
  let spare;
  let activeDate;
  let iframePage;
  let iframeContext;
  const login = async (client, pin) => json(await client.post('/api/login', { data: { pin } }));
  const dbValue = async key => (await env.db.execute(env.sql`select value from app_settings where key=${key}`)).rows[0]?.value;
  const duty = async (id, action, options = {}) => anonymous.post('/api/driver-form', { data: { k: driverKey, cabId: id, action, shiftType: 'day', ...options } });

  try {
    await check('Unauthenticated status is explicit; no PIN or hash is returned', async () => {
      const d = await json(await anonymous.get('/api/login'));
      assert.deepEqual(d, { authenticated: false, pinConfigured: true });
    });
    await check('Protected data APIs reject anonymous requests', async () => {
      for (const path of ['/api/settings', '/api/notifications', '/api/export', '/api/upload']) assert.equal((await anonymous.get(path)).status(), 401);
      assert.equal((await anonymous.post('/api/cabs', { data: { cabNumber: 'NO-AUTH' } })).status(), 401);
    });
    await page.goto(`${HTTPS_BASE}/cabs`);
    await check('Wrong PIN shows a useful error without unlocking', async () => {
      await page.getByLabel('Admin PIN', { exact: true }).fill('11111');
      await page.getByRole('button', { name: '🔓 Login', exact: true }).click();
      await expect(page.locator('#admin-login-error')).toContainText('Wrong PIN');
      await expect(page.getByRole('heading', { name: 'CabTrack Admin' })).toBeVisible();
    });
    await check('PIN show/hide and leading-zero legacy PIN work in a real browser', async () => {
      const field = page.getByLabel('Admin PIN', { exact: true });
      await field.fill(TEST_PIN);
      await page.getByRole('button', { name: 'Show PIN', exact: true }).click();
      await expect(field).toHaveAttribute('type','text');
      await page.getByRole('button', { name: 'Hide PIN', exact: true }).click();
      await expect(field).toHaveAttribute('type','password');
      await page.getByRole('button', { name: '🔓 Login', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Cabs, drivers & timing' })).toBeVisible();
    });
    await check('Session survives a browser reload and uses HttpOnly cookies', async () => {
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Cabs, drivers & timing' })).toBeVisible();
      const cookies = await context.cookies();
      assert(cookies.some(c => c.name === 'ct_admin' && c.httpOnly && c.secure));
      assert(cookies.some(c => c.name === 'ct_admin_embed' && c.httpOnly && c.secure && c.sameSite === 'None' && c.partitionKey));
      assert(!(await page.evaluate(() => document.cookie)).includes('ct_admin'));
    });
    await page.goto(`${HTTPS_BASE}/share`);
    await check('Confirm PIN mismatch is caught before saving', async () => {
      const before = await dbValue('admin_pin_hash');
      await pinPanel().getByLabel('Naya PIN', { exact: true }).fill(NEW_PIN);
      await pinPanel().getByLabel('Re-enter the PIN', { exact: true }).fill('007532');
      await pinPanel().getByRole('button', { name: 'Change PIN', exact: true }).click();
      await expect(pinPanel().getByRole('alert')).toContainText('do not match');
      assert.equal(await dbValue('admin_pin_hash'), before);
    });
    await check('Saving a new PIN keeps the admin logged in and displays recovery code', async () => {
      await pinPanel().getByLabel('Re-enter the PIN', { exact: true }).fill(NEW_PIN);
      await pinPanel().getByRole('button', { name: 'Change PIN', exact: true }).click();
      await expect(pinPanel().getByRole('status')).toContainText('PIN saved');
      recovery = await pinPanel().getByTestId('recovery-code').textContent();
      assert.match(recovery, /^[A-F0-9]{4}-[A-F0-9]{4}$/);
      assert((await dbValue('admin_pin_hash')).startsWith('scrypt$'));
      await page.screenshot({ path: '/tmp/cabtrack-pin-settings.png', fullPage: true });
    });
    await check('Logout clears cookies; old PIN fails and new PIN succeeds', async () => {
      await page.getByRole('button', { name: '🔒 Lock (logout)', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'CabTrack Admin' })).toBeVisible();
      await page.getByLabel('Admin PIN', { exact: true }).fill(TEST_PIN);
      await page.getByRole('button', { name: '🔓 Login', exact: true }).click();
      await expect(page.locator('#admin-login-error')).toContainText('Wrong PIN');
      await page.getByLabel('Admin PIN', { exact: true }).fill(NEW_PIN);
      await page.getByRole('button', { name: '🔓 Login', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Driver Form & Link' })).toBeVisible();
    });
    await check('Cross-site embedded preview login works with Hindi digits', async () => {
      iframeContext = await env.context();
      iframePage = await iframeContext.newPage();
      await iframePage.goto(SHELL_BASE);
      const frame = iframePage.frameLocator('#app');
      await frame.getByLabel('Admin PIN', { exact: true }).fill('००७५३१');
      await frame.getByRole('button', { name: '🔓 Login', exact: true }).click();
      await expect(frame.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
      const cookies = await iframeContext.cookies();
      assert(cookies.some(c => c.name === 'ct_admin_embed' && c.partitionKey && c.secure));
      assert(!cookies.some(c => c.name === 'ct_admin')); // third-party Lax cookie is blocked; CHIPS is doing the work
    });
    await check('Embedded session survives refresh; embedded logout also works', async () => {
      await iframePage.reload();
      const frame = iframePage.frameLocator('#app');
      await expect(frame.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
      await frame.getByRole('button', { name: '🔒 Lock (logout)', exact: true }).click();
      await expect(frame.getByRole('heading', { name: 'CabTrack Admin' })).toBeVisible();
    });
    await check('Recovery works on mobile without disabling the existing PIN', async () => {
      const mobile = await env.context({ viewport: { width: 390, height: 844 }, isMobile: true });
      const p = await mobile.newPage();
      await p.goto(`${HTTPS_BASE}/reports`);
      await p.getByRole('button', { name: 'Forgot your PIN? Use the recovery code' }).click();
      await p.getByLabel('Recovery code', { exact: true }).fill(recovery.replace('-','').toLowerCase());
      await p.getByRole('button', { name: '🔓 Login', exact: true }).click();
      await expect(p.getByText('You logged in with the recovery code.', { exact: false })).toBeVisible();
      assert.equal((await p.evaluate(() => fetch('/api/login', {cache:'no-store'}).then(r => r.json()))).authenticated, true);
      assert(await dbValue('admin_pin_hash'));
      assert.equal(await dbValue('admin_recovery_hash'), '');
      assert.equal((await anonymous.post('/api/login', { data: { pin: recovery } })).status(), 401);
      assert(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      const panel = p.getByTestId('admin-pin-settings');
      await panel.getByLabel('Naya PIN', { exact: true }).fill(FINAL_PIN);
      await panel.getByLabel('Re-enter the PIN', { exact: true }).fill(FINAL_PIN);
      await panel.getByRole('button', { name: 'Change PIN', exact: true }).click();
      await expect(panel.getByRole('status')).toContainText('PIN saved');
      await mobile.close();
    });
    await check('Changing PIN invalidates previously logged-in browsers', async () => {
      await page.reload();
      await expect(page.getByRole('heading', { name: 'CabTrack Admin' })).toBeVisible();
      await page.getByLabel('Admin PIN', { exact: true }).fill(FINAL_PIN);
      await page.getByRole('button', { name: '🔓 Login', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Driver Form & Link' })).toBeVisible();
    });
    await check('HTTP development login works without requiring HTTPS cookies', async () => {
      await login(api, FINAL_PIN);
      const state = await api.storageState();
      assert(state.cookies.some(c => c.name === 'ct_admin' && !c.secure && c.sameSite === 'Lax'));
      assert.equal((await json(await api.get('/api/login'))).authenticated, true);
    });
    await check('Malformed login inputs fail cleanly', async () => {
      for (const value of [null, [], {pin:1234}, {pin:''}, {pin:'x'.repeat(130)}]) {
        assert.equal((await anonymous.post('/api/login', { data: value })).status(), 400);
      }
    });
    await check('Cross-origin login, settings changes and logout are rejected', async () => {
      assert.equal((await api.patch('/api/settings', { headers: { Origin: 'https://untrusted.example' }, data: { driverFormEnabled: false } })).status(), 403);
      assert.equal((await api.delete('/api/login', { headers: { Origin: 'https://untrusted.example' } })).status(), 403);
      assert.equal((await anonymous.post('/api/login', { headers: { Origin: 'https://untrusted.example' }, data: { pin: FINAL_PIN } })).status(), 403);
    });
    await check('Settings validate all inputs before changing saved values', async () => {
      const before = await json(await api.get('/api/settings'));
      assert.equal((await api.patch('/api/settings', { data: { adminPin:'123', driverFormEnabled:!before.driverFormEnabled } })).status(), 400);
      assert.equal((await api.patch('/api/settings', { data: { adminPin:'1234', confirmPin:'4321' } })).status(), 400);
      assert.equal((await json(await api.get('/api/settings'))).driverFormEnabled, before.driverFormEnabled);
    });
    await check('Saved PIN and session still work after a production server restart', async () => {
      await env.restart();
      assert.equal((await json(await api.get('/api/login'))).authenticated, true);
      await login(api, FINAL_PIN);
    });
    await json(await api.patch('/api/settings', { data: { driverFormEnabled:true } }));
    driverKey = (await json(await api.get('/api/settings'))).key;
    const now = ist(); activeDate = now.date;
    await check('Add cab with inline driver, phone and shift timings', async () => {
      const d = await json(await api.post('/api/cabs', { data: { cabNumber:'PB-01-F-6430', ownerName:'Integration Test Owner', model:'Swift Dzire', dayIn:tm(now.m-15), dayOut:tm(now.m+60), dayDriverId:'new', dayDriverName:'Test Driver', dayDriverPhone:'9876000000', nightIn:'20:00', nightOut:'08:00', nightEnabled:false } }));
      cab = d.cab;
      const found = await json(await anonymous.get(`/api/driver-form?k=${driverKey}&q=6430`));
      assert.equal(found.cabs[0].shifts[0].driverName, 'Test Driver');
      assert.equal(found.cabs[0].shifts.length,1);
      driverId = found.cabs[0].shifts[0].driverId;
    });
    await check('Duplicate cab is rejected; driver details can be edited', async () => {
      assert.equal((await api.post('/api/cabs', {data:{cabNumber:cab.cabNumber}})).status(),409);
      await json(await api.patch(`/api/drivers/${driverId}`, {data:{phone:'9876000001'}}));
      const d = await json(await anonymous.get(`/api/driver-form?k=${driverKey}&q=9876000001`));
      assert.equal(d.cabs[0].cabId,cab.id);
    });
    await check('Cab-number lookup and invalid driver links behave correctly', async () => {
      assert.equal((await anonymous.get('/api/driver-form?k=wrong&q=6430')).status(),403);
      const empty = await json(await anonymous.get(`/api/driver-form?k=${driverKey}&q=0000`));
      assert.equal(empty.cabs.length,0);
    });
    const driverContext = await env.context({viewport:{width:390,height:844},isMobile:true});
    const driverPage = await driverContext.newPage();
    driverPage.on('pageerror', e => browserErrors.push(e.message));
    await check('Mobile driver form shows cab, regular driver and timing', async () => {
      await driverPage.goto(`${HTTPS_BASE}/driver?k=${driverKey}&cab=PB01F6430`);
      await expect(driverPage.getByText(cab.cabNumber,{exact:true})).toBeVisible();
      await expect(driverPage.getByText('🧑‍✈️ Test Driver',{exact:true})).toBeVisible();
      assert(await driverPage.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    });
    await check('DUTY ON saves server time and records a late arrival', async () => {
      await driverPage.getByRole('button',{name:'🟢 DUTY ON',exact:true}).click();
      await driverPage.getByRole('button',{name:'✅ Submit — DUTY ON',exact:true}).click();
      await expect(driverPage.getByText('Duty ON ✅', {exact:false})).toBeVisible();
      const rec = (await env.db.execute(env.sql`select * from attendance where cab_id=${cab.id} and shift_type='day' and date=${activeDate}`)).rows[0];
      assert.equal(rec.status,'present'); assert.equal(rec.source,'driver'); assert(rec.actual_in); assert(rec.late_minutes>=14);
    });
    await check('Repeated DUTY ON is idempotent (no duplicate submissions)', async () => {
      const before = Number((await env.db.execute(env.sql`select count(*) n from driver_submissions where cab_id=${cab.id}`)).rows[0].n);
      await json(await duty(cab.id,'on'));
      const after = Number((await env.db.execute(env.sql`select count(*) n from driver_submissions where cab_id=${cab.id}`)).rows[0].n);
      assert.equal(after,before);
    });
    await page.goto(`${HTTPS_BASE}/`);
    await expect(page.getByRole('heading',{name:'Dashboard',exact:true})).toBeVisible();
    await check('DUTY OFF records early-off and updates live dashboard alerts', async () => {
      await driverPage.getByRole('button',{name:'✔️ OK',exact:true}).click();
      await driverPage.getByRole('button',{name:'🔴 DUTY OFF',exact:true}).click();
      await driverPage.getByRole('textbox').last().fill('Vehicle repair');
      await driverPage.getByRole('button',{name:'✅ Submit — DUTY OFF',exact:true}).click();
      await expect(driverPage.getByText('Duty OFF ✅',{exact:false})).toBeVisible();
      const rec = (await env.db.execute(env.sql`select * from attendance where cab_id=${cab.id} and shift_type='day' and date=${activeDate}`)).rows[0];
      assert(rec.early_off_minutes>=55); assert(rec.notes.includes('Vehicle repair'));
      await expect(page.getByText(/6430 went off duty .* early/).first()).toBeVisible({timeout:25000});
    });
    await check('Repeated DUTY OFF preserves the first time and produces no duplicate alerts', async () => {
      const snapshot = async()=>{
        const rec=(await env.db.execute(env.sql`select actual_in,actual_out,updated_at from attendance where cab_id=${cab.id} and date=${activeDate} and shift_type='day'`)).rows[0];
        const counts=(await env.db.execute(env.sql`select (select count(*) from notifications where cab_id=${cab.id})::int as alerts,(select count(*) from driver_submissions where cab_id=${cab.id})::int as submissions`)).rows[0];
        return {...rec,...counts};
      };
      const before=await snapshot(); await json(await duty(cab.id,'off')); assert.deepEqual(await snapshot(),before);
    });
    await check('Completed duty cannot be accidentally erased by ON or LEAVE', async () => {
      assert.equal((await duty(cab.id,'on')).status(),400);
      assert.equal((await duty(cab.id,'leave')).status(),400);
      const rec=(await env.db.execute(env.sql`select actual_in,actual_out,status from attendance where cab_id=${cab.id} and date=${activeDate} and shift_type='day'`)).rows[0];
      assert(rec.actual_in && rec.actual_out); assert.equal(rec.status,'present');
    });
    await check('A disabled shift cannot be started by the driver', async () => {
      assert.equal((await duty(cab.id,'on',{shiftType:'night'})).status(),400);
    });
    await check('Unknown driver ID is rejected instead of silently changing driver', async () => {
      assert.equal((await duty(cab.id,'on',{driverId:'11111111-1111-1111-1111-111111111111'})).status(),400);
    });
    await check('LEAVE saves notes and appears in report data', async () => {
      spare=(await json(await api.post('/api/cabs',{data:{cabNumber:'PB-01-G-2218',dayEnabled:true,nightEnabled:false,dayIn:tm(now.m-10),dayOut:tm(now.m+60),dayDriverId:driverId}}))).cab;
      await json(await duty(spare.id,'leave',{note:'Unwell'}));
      const rec=(await env.db.execute(env.sql`select * from attendance where cab_id=${spare.id} and status='leave'`)).rows[0]; assert(rec.notes.includes('Unwell'));
    });
    await check('Notifications persist and can be marked read', async () => {
      const data=await json(await api.get('/api/notifications'));
      assert(data.items.some(n=>n.type==='early_off' && n.cabId===cab.id));
      assert(data.items.some(n=>n.type==='leave' && n.cabId===spare.id));
      assert(data.unread>0); assert.equal((await json(await api.patch('/api/notifications',{data:{}}))).unread,0);
    });
    await check('Daily report contains driver name, duty times and early-off remarks', async () => {
      await page.goto(`${HTTPS_BASE}/reports?date=${activeDate}`);
      await expect(page.getByRole('heading',{name:'Daily report',exact:true})).toBeVisible();
      await expect(page.getByText('Vehicle repair',{exact:false}).first()).toBeVisible();
      await expect(page.getByText('Test Driver',{exact:false}).first()).toBeVisible();
    });
    await check('Attendance shows driver updates and permits a manual note edit', async () => {
      await page.goto(`${HTTPS_BASE}/attendance?date=${activeDate}`);
      const row=page.getByRole('row').filter({hasText:cab.cabNumber}).first();
      await expect(row.getByText('📱 Filled by driver',{exact:true})).toBeVisible();
      const notes=row.locator('input[placeholder="optional"]');
      await notes.fill('Manually verified by owner');
      await row.getByRole('button',{name:'Save',exact:true}).click();
      await expect(page.getByText(/row\(s\) saved/)).toBeVisible();
      const rec=(await env.db.execute(env.sql`select notes,source from attendance where cab_id=${cab.id} and date=${activeDate} and shift_type='day'`)).rows[0];
      assert.equal(rec.notes,'Manually verified by owner'); assert.equal(rec.source,'manual');
    });
    await check('Invalid attendance time or date is rejected', async () => {
      const base={cabId:cab.id,date:activeDate,shiftType:'day',status:'present',scheduledIn:'08:00',scheduledOut:'20:00'};
      assert.equal((await api.post('/api/attendance',{data:{entries:[{...base,actualIn:'25:99'}]}})).status(),400);
      assert.equal((await api.post('/api/attendance',{data:{entries:[{...base,date:'2026-02-31'}]}})).status(),400);
    });
    await check('Date navigation works for repeated previous/next clicks', async () => {
      await page.getByRole('button',{name:'Previous day',exact:true}).click();
      await expect(page.getByRole('button',{name:'Previous day',exact:true})).toBeEnabled();
      await page.getByRole('button',{name:'Previous day',exact:true}).click();
      await expect(page.getByRole('button',{name:'Next day',exact:true})).toBeEnabled();
      await page.getByRole('button',{name:'Next day',exact:true}).click();
      await expect(page.getByRole('button',{name:'Previous day',exact:true})).toBeEnabled();
    });
    await check('CSV preview, import and re-upload merge without duplicates', async () => {
      const csv=`Date,Cab Number,Shift,In Time,Out Time,Driver,Status\n${activeDate},PB-99-Z-9009,Day,08:05,20:00,Import Driver,P\n`;
      const form={file:{name:'integration.csv',mimeType:'text/csv',buffer:Buffer.from(csv)},mode:'preview'};
      const preview=await json(await api.post('/api/upload',{multipart:form})); assert.equal(preview.counts.attendance,1);
      const first=await json(await api.post('/api/upload',{multipart:{...form,mode:'save'}})); assert.equal(first.attendanceNew,1);
      const second=await json(await api.post('/api/upload',{multipart:{...form,mode:'save'}})); assert.equal(second.attendanceNew,0); assert.equal(second.attendanceUpdated,1);
    });
    await check('Full Excel backup downloads and contains cab/driver/attendance sheets', async () => {
      const res=await api.get('/api/export'); assert.equal(res.status(),200);
      const wb=XLSX.read(await res.body(),{type:'buffer'});
      assert.deepEqual(wb.SheetNames,['Cabs','Drivers','Attendance']);
      const rows=XLSX.utils.sheet_to_json(wb.Sheets.Attendance); assert(rows.some(r=>r['Cab Number']===cab.cabNumber));
      assert(!JSON.stringify(rows).includes('admin_pin_hash'));
    });
    await check('All admin pages render authenticated without application errors', async () => {
      for(const p of ['/','/attendance','/reports','/reports?view=range','/share','/share/print','/cabs','/drivers','/upload','/settings']) {
        const res=await api.get(p); assert.equal(res.status(),200); const text=await res.text();
        assert(!text.includes('Application error')); assert(!text.includes('Enter your admin PIN'));
      }
    });
    await check('Turning the driver form OFF rejects submissions; ON restores it', async () => {
      await json(await api.patch('/api/settings',{data:{driverFormEnabled:false}}));
      assert.equal((await duty(spare.id,'on')).status(),403);
      await json(await api.patch('/api/settings',{data:{driverFormEnabled:true}}));
      assert.equal((await anonymous.get(`/api/driver-form?k=${driverKey}&q=6430`)).status(),200);
    });
    await check('Regenerating driver link invalidates only the old driver key', async () => {
      const d=await json(await api.patch('/api/settings',{data:{regenerateKey:true}}));
      assert.notEqual(d.key,driverKey);
      assert.equal((await anonymous.get(`/api/driver-form?k=${driverKey}&q=6430`)).status(),403);
      driverKey=d.key;
      assert.equal((await anonymous.get(`/api/driver-form?k=${driverKey}&q=6430`)).status(),200);
      assert.equal((await json(await api.get('/api/login'))).authenticated,true);
    });
    await check('Wrong-PIN brute-force attempts get a retry delay', async () => {
      const brute=await request.newContext({baseURL:HTTP_BASE,extraHTTPHeaders:{'x-forwarded-for':'198.51.100.23'}});clients.push(brute);
      for(let i=0;i<8;i++) assert.equal((await brute.post('/api/login',{data:{pin:'99999'}})).status(),401);
      const res=await brute.post('/api/login',{data:{pin:'99999'}}); const d=await json(res,429);
      assert(d.retryAfter>0); assert(Number(res.headers()['retry-after'])>0);
    });
    await check('PIN can be removed explicitly and re-enabled with the same session flow', async () => {
      await json(await api.patch('/api/settings',{data:{adminPin:'',confirmPin:''}}));
      assert.deepEqual(await json(await anonymous.get('/api/login')),{authenticated:true,pinConfigured:false});
      await json(await api.patch('/api/settings',{data:{adminPin:FINAL_PIN,confirmPin:FINAL_PIN}}));
      assert.equal((await json(await api.get('/api/login'))).authenticated,true);
      assert.equal((await json(await anonymous.get('/api/login'))).authenticated,false);
    });
    await check('PIN can be changed inside the cross-site preview without losing recovery code', async () => {
      await iframePage.goto(`${SHELL_BASE}?path=${encodeURIComponent('/share')}`);
      const frame=iframePage.frameLocator('#app');
      await frame.getByLabel('Admin PIN',{exact:true}).fill(FINAL_PIN);
      await frame.getByRole('button',{name:'🔓 Login',exact:true}).click();
      const panel=frame.getByTestId('admin-pin-settings');
      await expect(panel).toBeVisible();
      await panel.getByLabel('Naya PIN',{exact:true}).fill('000864');
      await panel.getByLabel('Re-enter the PIN',{exact:true}).fill('000864');
      await panel.getByRole('button',{name:'Change PIN',exact:true}).click();
      await expect(panel.getByRole('status')).toContainText('PIN saved');
      await expect(panel.getByTestId('recovery-code')).toBeVisible();
      await iframePage.reload();
      await expect(frame.getByRole('heading',{name:'Driver Form & Link',exact:true})).toBeVisible();
      await frame.getByRole('button',{name:'🔒 Lock (logout)',exact:true}).click();
      await frame.getByLabel('Admin PIN',{exact:true}).fill('000864');
      await frame.getByRole('button',{name:'🔓 Login',exact:true}).click();
      await expect(frame.getByRole('heading',{name:'Driver Form & Link',exact:true})).toBeVisible();
      await login(api,'000864');
    });
    await check('Corrupted or non-ASCII session cookies fail closed without a server error', async () => {
      const invalid=await request.newContext({baseURL:HTTP_BASE,extraHTTPHeaders:{Cookie:`ct_admin=${encodeURIComponent('é'.repeat(64))}`}});clients.push(invalid);
      const d=await json(await invalid.get('/api/login'));assert.equal(d.authenticated,false);
      assert.equal((await invalid.get('/api/settings')).status(),401);
    });
    await check('Simultaneous DUTY ON taps create exactly one saved event', async () => {
      const t=ist();
      const c=(await json(await api.post('/api/cabs',{data:{cabNumber:'PB-01-F-7788',dayIn:tm(t.m-10),dayOut:tm(t.m+60),dayEnabled:true,nightEnabled:false,dayDriverId:driverId}}))).cab;
      const response=await Promise.all([duty(c.id,'on'),duty(c.id,'on')]);
      for(const res of response)await json(res);
      const n=(await env.db.execute(env.sql`select (select count(*) from notifications where cab_id=${c.id})::int as alerts,(select count(*) from driver_submissions where cab_id=${c.id})::int as submits`)).rows[0];
      assert.deepEqual(n,{alerts:1,submits:1});
      spare=c;
    });
    await check('Simultaneous DUTY OFF taps also create exactly one saved event', async () => {
      const response=await Promise.all([duty(spare.id,'off'),duty(spare.id,'off')]);
      for(const res of response)await json(res);
      const n=(await env.db.execute(env.sql`select (select count(*) from notifications where cab_id=${spare.id})::int as alerts,(select count(*) from driver_submissions where cab_id=${spare.id})::int as submits`)).rows[0];
      assert.deepEqual(n,{alerts:2,submits:2});
    });
    await check('Night-shift late, early-off, overtime and midnight duration calculations', async () => {
      const ts=require('typescript');
      const source=fs.readFileSync('src/lib/tracking.ts','utf8');
      const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
      const mod={exports:{}};new Function('exports','require','module',compiled)(mod.exports,require,mod);
      const t=mod.exports;
      assert.equal(t.computeLateMinutes('23:45','00:15'),30);
      assert.equal(t.computeLateMinutes('20:00','19:50'),0);
      assert.equal(t.computeEarlyMinutes('08:00','07:30'),30);
      assert.equal(t.computeOvertimeMinutes('08:00','09:00'),60);
      assert.equal(t.dutyMinutes('20:00','08:00'),720);
      assert.equal(t.dutyMinutes(null,'08:00'),null);
      assert.equal(t.hhmm('08:10:00'),'08:10');
      assert.equal(t.isValidTime('25:99'),false);
    });
    await check('No unhandled browser errors in admin or mobile driver flows', async () => {
      assert.deepEqual(browserErrors,[]);
    });
  } catch (error) {
    failed = error;
    console.error(`FAIL after ${results.length} passing checks:`, error.message);
    try { await page.screenshot({path:'/tmp/cabtrack-failed-check.png',fullPage:true}); } catch {}
  } finally {
    fs.writeFileSync('/tmp/cabtrack-regression.json',JSON.stringify({passed:results.length,failed:failed?failed.message:null,checks:results},null,2));
    for(const c of clients) await c.dispose();
    await env.stop();
  }
  if(failed) throw failed;
  console.log(`ALL ${results.length} REGRESSION CHECKS PASSED. Real database was not used.`);
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
