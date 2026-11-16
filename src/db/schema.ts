import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  date,
  time,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/**
 * Cabs (vehicles) of the fleet.
 */
export const cabs = pgTable("cabs", {
  id: uuid("id").primaryKey().defaultRandom(),
  cabNumber: text("cab_number").notNull().unique(),
  model: text("model").notNull().default(""),
  ownerName: text("owner_name").notNull().default(""),
  color: text("color").notNull().default("#6366f1"),
  capacity: integer("capacity").notNull().default(4),
  fuelType: text("fuel_type").notNull().default("CNG"),
  status: text("status").notNull().default("active"), // active | inactive | maintenance
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Drivers.
 */
export const drivers = pgTable("drivers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  phone: text("phone").notNull().default(""),
  licenseNumber: text("license_number").notNull().default(""),
  licenseExpiry: date("license_expiry"),
  status: text("status").notNull().default("active"), // active | inactive
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Default shift template per cab: day shift timing + night shift timing.
 * Holds each cab's usual start and end time for the day and night shift.
 */
export const cabShifts = pgTable(
  "cab_shifts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabId: uuid("cab_id")
      .notNull()
      .references(() => cabs.id, { onDelete: "cascade" }),
    shiftType: text("shift_type").notNull(), // day | night
    scheduledIn: time("scheduled_in").notNull().default("08:00"),
    scheduledOut: time("scheduled_out").notNull().default("20:00"),
    isDefault: boolean("is_default").notNull().default(true),
    enabled: boolean("enabled").notNull().default(true),
    defaultDriverId: uuid("default_driver_id").references(() => drivers.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    uniqueIndex("cab_shifts_cab_shift_unique").on(t.cabId, t.shiftType),
  ],
);

/**
 * Daily attendance / arrival log — one row per cab, per date, per shift.
 * Rows are auto-generated (status = pending) so the operator only fills the
 * actual arrival / departure times.
 */
export const attendance = pgTable(
  "attendance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabId: uuid("cab_id")
      .notNull()
      .references(() => cabs.id, { onDelete: "cascade" }),
    driverId: uuid("driver_id").references(() => drivers.id, {
      onDelete: "set null",
    }),
    date: date("date").notNull(),
    shiftType: text("shift_type").notNull(), // day | night
    status: text("status").notNull().default("pending"), // pending | present | absent | leave | half_day | off
    scheduledIn: time("scheduled_in").notNull().default("08:00"),
    scheduledOut: time("scheduled_out").notNull().default("20:00"),
    actualIn: time("actual_in"),
    actualOut: time("actual_out"),
    lateMinutes: integer("late_minutes").notNull().default(0),
    overtimeMinutes: integer("overtime_minutes").notNull().default(0),
    earlyOffMinutes: integer("early_off_minutes").notNull().default(0),
    reason: text("reason").notNull().default(""),
    notes: text("notes").notNull().default(""),
    source: text("source").notNull().default("manual"), // auto | manual
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("attendance_cab_date_shift_unique").on(
      t.cabId,
      t.date,
      t.shiftType,
    ),
    index("attendance_date_idx").on(t.date),
    index("attendance_status_idx").on(t.status),
    index("attendance_cab_idx").on(t.cabId),
    index("attendance_driver_idx").on(t.driverId),
  ],
);

export type Cab = typeof cabs.$inferSelect;
export type NewCab = typeof cabs.$inferInsert;
export type Driver = typeof drivers.$inferSelect;
export type NewDriver = typeof drivers.$inferInsert;
export type CabShift = typeof cabShifts.$inferSelect;
export type NewCabShift = typeof cabShifts.$inferInsert;
export type Attendance = typeof attendance.$inferSelect;
export type NewAttendance = typeof attendance.$inferInsert;

/** Key/value app settings (e.g. driver form on/off). */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** History of every sheet upload. */
export const uploads = pgTable("uploads", {
  id: uuid("id").primaryKey().defaultRandom(),
  fileName: text("file_name").notNull(),
  totalRows: integer("total_rows").notNull().default(0),
  inserted: integer("inserted").notNull().default(0),
  updated: integer("updated").notNull().default(0),
  skipped: integer("skipped").notNull().default(0),
  cabsCreated: integer("cabs_created").notNull().default(0),
  driversCreated: integer("drivers_created").notNull().default(0),
  errors: text("errors").notNull().default(""),
  fileData: text("file_data"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Driver self-submissions from the (optional) driver form. */
export const driverSubmissions = pgTable("driver_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  cabId: uuid("cab_id").notNull().references(() => cabs.id, { onDelete: "cascade" }),
  driverId: uuid("driver_id").references(() => drivers.id, { onDelete: "set null" }),
  date: date("date").notNull(),
  shiftType: text("shift_type").notNull(),
  actualIn: time("actual_in"),
  actualOut: time("actual_out"),
  action: text("action").notNull().default(""),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Upload = typeof uploads.$inferSelect;

/** Live alerts for the owner (driver duty on/off, early off, leave …). */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(), // duty_on | duty_off | early_off | late | leave | not_reported | info
    title: text("title").notNull(),
    message: text("message").notNull().default(""),
    cabId: uuid("cab_id").references(() => cabs.id, { onDelete: "cascade" }),
    driverId: uuid("driver_id").references(() => drivers.id, { onDelete: "set null" }),
    date: date("date"),
    dedupeKey: text("dedupe_key").unique(),
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_created_idx").on(t.createdAt)],
);

export type Notification = typeof notifications.$inferSelect;
