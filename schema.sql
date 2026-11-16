--
-- PostgreSQL database dump
--


-- Dumped from database version 15.19 (Debian 15.19-0+deb12u1)
-- Dumped by pg_dump version 15.19 (Debian 15.19-0+deb12u1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    key text NOT NULL,
    value text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cab_id uuid NOT NULL,
    driver_id uuid,
    date date NOT NULL,
    shift_type text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    scheduled_in time without time zone DEFAULT '08:00:00'::time without time zone NOT NULL,
    scheduled_out time without time zone DEFAULT '20:00:00'::time without time zone NOT NULL,
    actual_in time without time zone,
    actual_out time without time zone,
    late_minutes integer DEFAULT 0 NOT NULL,
    overtime_minutes integer DEFAULT 0 NOT NULL,
    reason text DEFAULT ''::text NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    early_off_minutes integer DEFAULT 0 NOT NULL
);


--
-- Name: cab_shifts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cab_shifts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cab_id uuid NOT NULL,
    shift_type text NOT NULL,
    scheduled_in time without time zone DEFAULT '08:00:00'::time without time zone NOT NULL,
    scheduled_out time without time zone DEFAULT '20:00:00'::time without time zone NOT NULL,
    is_default boolean DEFAULT true NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    default_driver_id uuid
);


--
-- Name: cabs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cabs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cab_number text NOT NULL,
    model text DEFAULT ''::text NOT NULL,
    color text DEFAULT '#6366f1'::text NOT NULL,
    capacity integer DEFAULT 4 NOT NULL,
    fuel_type text DEFAULT 'CNG'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    owner_name text DEFAULT ''::text NOT NULL
);


--
-- Name: driver_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.driver_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cab_id uuid NOT NULL,
    driver_id uuid,
    date date NOT NULL,
    shift_type text NOT NULL,
    actual_in time without time zone,
    actual_out time without time zone,
    note text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    action text DEFAULT ''::text NOT NULL
);


--
-- Name: drivers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.drivers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    phone text DEFAULT ''::text NOT NULL,
    license_number text DEFAULT ''::text NOT NULL,
    license_expiry date,
    status text DEFAULT 'active'::text NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    message text DEFAULT ''::text NOT NULL,
    cab_id uuid,
    driver_id uuid,
    date date,
    dedupe_key text,
    read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: uploads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uploads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    file_name text NOT NULL,
    total_rows integer DEFAULT 0 NOT NULL,
    inserted integer DEFAULT 0 NOT NULL,
    updated integer DEFAULT 0 NOT NULL,
    skipped integer DEFAULT 0 NOT NULL,
    cabs_created integer DEFAULT 0 NOT NULL,
    drivers_created integer DEFAULT 0 NOT NULL,
    errors text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    file_data text
);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);


--
-- Name: attendance attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_pkey PRIMARY KEY (id);


--
-- Name: cab_shifts cab_shifts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cab_shifts
    ADD CONSTRAINT cab_shifts_pkey PRIMARY KEY (id);


--
-- Name: cabs cabs_cab_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cabs
    ADD CONSTRAINT cabs_cab_number_unique UNIQUE (cab_number);


--
-- Name: cabs cabs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cabs
    ADD CONSTRAINT cabs_pkey PRIMARY KEY (id);


--
-- Name: driver_submissions driver_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.driver_submissions
    ADD CONSTRAINT driver_submissions_pkey PRIMARY KEY (id);


--
-- Name: drivers drivers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drivers
    ADD CONSTRAINT drivers_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_dedupe_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_dedupe_key_unique UNIQUE (dedupe_key);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: uploads uploads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uploads
    ADD CONSTRAINT uploads_pkey PRIMARY KEY (id);


--
-- Name: attendance_cab_date_shift_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX attendance_cab_date_shift_unique ON public.attendance USING btree (cab_id, date, shift_type);


--
-- Name: attendance_cab_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attendance_cab_idx ON public.attendance USING btree (cab_id);


--
-- Name: attendance_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attendance_date_idx ON public.attendance USING btree (date);


--
-- Name: attendance_driver_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attendance_driver_idx ON public.attendance USING btree (driver_id);


--
-- Name: attendance_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attendance_status_idx ON public.attendance USING btree (status);


--
-- Name: cab_shifts_cab_shift_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cab_shifts_cab_shift_unique ON public.cab_shifts USING btree (cab_id, shift_type);


--
-- Name: notifications_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_created_idx ON public.notifications USING btree (created_at);


--
-- Name: attendance attendance_cab_id_cabs_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_cab_id_cabs_id_fk FOREIGN KEY (cab_id) REFERENCES public.cabs(id) ON DELETE CASCADE;


--
-- Name: attendance attendance_driver_id_drivers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_driver_id_drivers_id_fk FOREIGN KEY (driver_id) REFERENCES public.drivers(id) ON DELETE SET NULL;


--
-- Name: cab_shifts cab_shifts_cab_id_cabs_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cab_shifts
    ADD CONSTRAINT cab_shifts_cab_id_cabs_id_fk FOREIGN KEY (cab_id) REFERENCES public.cabs(id) ON DELETE CASCADE;


--
-- Name: cab_shifts cab_shifts_default_driver_id_drivers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cab_shifts
    ADD CONSTRAINT cab_shifts_default_driver_id_drivers_id_fk FOREIGN KEY (default_driver_id) REFERENCES public.drivers(id) ON DELETE SET NULL;


--
-- Name: driver_submissions driver_submissions_cab_id_cabs_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.driver_submissions
    ADD CONSTRAINT driver_submissions_cab_id_cabs_id_fk FOREIGN KEY (cab_id) REFERENCES public.cabs(id) ON DELETE CASCADE;


--
-- Name: driver_submissions driver_submissions_driver_id_drivers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.driver_submissions
    ADD CONSTRAINT driver_submissions_driver_id_drivers_id_fk FOREIGN KEY (driver_id) REFERENCES public.drivers(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_cab_id_cabs_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_cab_id_cabs_id_fk FOREIGN KEY (cab_id) REFERENCES public.cabs(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_driver_id_drivers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_driver_id_drivers_id_fk FOREIGN KEY (driver_id) REFERENCES public.drivers(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--


