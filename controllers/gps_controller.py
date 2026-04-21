# -*- coding: utf-8 -*-
import logging
from odoo import http, fields
from odoo.http import request

_logger = logging.getLogger(__name__)


class EagleIoTGPSController(http.Controller):

    # ── Helper: get-or-create res.country.state ──────────────────
    def _get_or_create_state(self, city_name):
        """
        Search for a state/city by name inside Saudi Arabia (SA).
        If not found → create it and return the record.

        :param city_name: e.g. "الرياض" or "Riyadh"
        :return: res.country.state record (or False if city_name is empty)
        """
        if not city_name:
            return False

        # ── get country (SA hardcoded) ────────────────────────────
        country = request.env['res.country'].sudo().search(
            [('code', '=', 'SA')], limit=1
        )
        if not country:
            _logger.warning("Eagle-IoT: Country 'SA' not found in system.")
            return False

        # ── search existing state ─────────────────────────────────
        state = request.env['res.country.state'].sudo().search([
            ('name',       'ilike', city_name.strip()),
            ('country_id', '=',     country.id),
        ], limit=1)

        if state:
            return state

        # ── not found → create new state ─────────────────────────
        _logger.info(
            "Eagle-IoT: City '%s' not found → creating new state.", city_name
        )

        # generate a short unique code from the name
        code = city_name.strip().upper()[:5].replace(' ', '_')

        # make sure the code is unique inside the country
        existing_codes = request.env['res.country.state'].sudo().search([
            ('country_id', '=', country.id),
            ('code',       'like', code),
        ]).mapped('code')

        unique_code = code
        counter = 1
        while unique_code in existing_codes:
            unique_code = f"{code}{counter}"
            counter += 1

        state = request.env['res.country.state'].sudo().create({
            'name':       city_name.strip(),
            'code':       unique_code,
            'country_id': country.id,
        })
        _logger.info(
            "Eagle-IoT: Created new state → id=%s, name='%s', code='%s'",
            state.id, state.name, state.code
        )
        return state

    # ── Webhook: GPS update ──────────────────────────────────────
    @http.route(
        '/api/eagle-iot/gps/update',
        type='json',
        auth='none',
        methods=['POST'],
        csrf=False,
        save_session=False,
    )
    def eagle_iot_gps_update(self, **kwargs):
        """
        Eagle-IoT sends POST GPS data.
        """
        try:
            payload = request.get_json_data()
            # Odoo JSON-RPC wraps data in 'params'
            if 'params' in payload:
                payload = payload['params']
            _logger.info("Eagle-IoT GPS received: %s", payload)

            # ── 1. extract required fields ────────────────────────
            vehicle_id = payload.get('license_plate')
            latitude   = payload.get('latitude')
            longitude  = payload.get('longitude')

            if not vehicle_id or latitude is None or longitude is None:
                return {
                    'status':  'error',
                    'message': 'Missing required fields: license_plate, latitude, longitude',
                }

            # ── 2. extract optional fields ────────────────────────
            start_name = payload.get('start_point')
            dest_name  = payload.get('destination')
            trip_name  = payload.get('trip_name')

            # ── 3. find the active trip ───────────────────────────
            # priority: trip_name > license_plate (latest)
            trip = False

            if trip_name:
                trip = request.env['freight.trip'].sudo().search([
                    ('name', '=', trip_name),
                ], limit=1)

            if not trip:
                trip = request.env['freight.trip'].sudo().search([
                    ('vehicle_id.license_plate', '=', vehicle_id),
                ], limit=1, order='id desc')

            if not trip:
                _logger.info("Eagle-IoT: No trip found for vehicle '%s'", vehicle_id)
                return {'status': 'ok', 'message': 'No trip found for this vehicle'}

            # ── 4. build write values ─────────────────────────────
            write_vals = {
                'gps_latitude':    float(latitude),
                'gps_longitude':   float(longitude),
                'gps_last_update': fields.Datetime.now(),
            }

            # ── 5. resolve start_point ────────────────────────────
            start_state = False
            if start_name:
                start_state = self._get_or_create_state(start_name)
                if start_state and trip.starting_point_id.id != start_state.id:
                    write_vals['starting_point_id'] = start_state.id
                    _logger.info(
                        "Eagle-IoT: Trip %s -> starting_point updated to '%s'",
                        trip.name, start_state.name
                    )

            # ── 6. resolve destination ────────────────────────────
            dest_state = False
            if dest_name:
                dest_state = self._get_or_create_state(dest_name)
                if dest_state and trip.destination_id.id != dest_state.id:
                    write_vals['destination_id'] = dest_state.id
                    _logger.info(
                        "Eagle-IoT: Trip %s -> destination updated to '%s'",
                        trip.name, dest_state.name
                    )

            # ── 7. write all changes at once ──────────────────────
            trip.write(write_vals)

            # ── 8. log GPS position ───────────────────────────────
            request.env['freight.trip.gps.log'].sudo().create({
                'trip_id':   trip.id,
                'latitude':  float(latitude),
                'longitude': float(longitude),
            })

            _logger.info(
                "Eagle-IoT: Trip %s updated -> lat=%.5f, lng=%.5f",
                trip.name, float(latitude), float(longitude)
            )

            return {
                'status':      'ok',
                'trip':        trip.name,
                'message':     'GPS updated successfully',
                'start_point': start_state.name if start_state else None,
                'destination': dest_state.name  if dest_state  else None,
            }

        except Exception as e:
            _logger.exception("Eagle-IoT GPS webhook error: %s", e)
            return {'status': 'error', 'message': str(e)}

    # ── Health Check ─────────────────────────────────────────────
    @http.route(
        '/api/eagle-iot/gps/ping',
        type='json',
        auth='none',
        methods=['GET', 'POST'],
        csrf=False,
    )
    def ping(self, **kwargs):
        return {'status': 'ok', 'message': 'Freight GPS endpoint is alive'}