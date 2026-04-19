# -*- coding: utf-8 -*-
import json
import logging
from odoo import http, fields
from odoo.http import request

_logger = logging.getLogger(__name__)


class EagleIoTGPSController(http.Controller):

    # ── Webhook: GPS update ─────────────────────
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
        
        Expected payload:
        {
            "api_key":    "your-secret-key",
            "vehicle_id": "ABC-123",        
            "latitude":   24.231,
            "longitude":  44.123
        }
        """
        try:
            payload = request.get_json_data()
            _logger.info("Eagle-IoT GPS received: %s", payload)

            # ── 1. API Key ────────────────────────
            api_key      = payload.get('api_key', '')
            expected_key = request.env['ir.config_parameter'].sudo().get_param(
                'freight_management_system.eagle_iot_api_key', ''
            )
            if expected_key and api_key != expected_key:
                _logger.warning("Eagle-IoT: Invalid API key.")
                return {'status': 'error', 'message': 'Invalid API key'}

            # ── 2. get data ─────────────────────────────
            vehicle_id = payload.get('vehicle_id') or payload.get('license_plate')
            latitude   = payload.get('latitude')
            longitude  = payload.get('longitude')

            if not vehicle_id or latitude is None or longitude is None:
                return {
                    'status':  'error',
                    'message': 'Missing fields: vehicle_id, latitude, longitude'
                }

            # ── 3. search active trip ──────────────────────
            trip = request.env['freight.trip'].sudo().search([
                ('vehicle_id.license_plate', '=', vehicle_id),
                ('state', 'in', ['confirmed', 'in_transit']),
            ], limit=1, order='id desc')

            if not trip:
                _logger.info("Eagle-IoT: No active trip for vehicle '%s'", vehicle_id)
                return {'status': 'ok', 'message': 'No active trip found'}

            # ── 4. update trip gps ────────────────────────
            trip.write({
                'gps_latitude':   float(latitude),
                'gps_longitude':  float(longitude),
                'gps_last_update': fields.Datetime.now(),
            })

            # ── 5. save gps log ──────────────────────
            request.env['freight.trip.gps.log'].sudo().create({
                'trip_id':   trip.id,
                'latitude':  float(latitude),
                'longitude': float(longitude),
            })

            _logger.info(
                "Eagle-IoT: Trip %s updated → lat=%.5f, lng=%.5f",
                trip.name, float(latitude), float(longitude)
            )

            return {
                'status':  'ok',
                'trip':    trip.name,
                'message': 'GPS updated successfully',
            }

        except Exception as e:
            _logger.exception("Eagle-IoT GPS webhook error: %s", e)
            return {'status': 'error', 'message': str(e)}

    # ── Health Check: Eagle-IoT endpoint ──────
    @http.route(
        '/api/eagle-iot/gps/ping',
        type='json',
        auth='none',
        methods=['GET', 'POST'],
        csrf=False,
    )
    def ping(self, **kwargs):
        return {'status': 'ok', 'message': 'Freight GPS endpoint is alive'}