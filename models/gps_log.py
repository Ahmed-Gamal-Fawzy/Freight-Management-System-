# -*- coding: utf-8 -*-
from odoo import models, fields


class FreightTripGpsLog(models.Model):
    _name        = 'freight.trip.gps.log'
    _description = 'Freight Trip GPS Log'
    _order       = 'id asc'

    trip_id   = fields.Many2one(
        'freight.trip',
        string='Trip',
        required=True,
        ondelete='cascade',  
        index=True
    )
    latitude  = fields.Float(string='Latitude',      digits=(10, 7))
    longitude = fields.Float(string='Longitude',     digits=(10, 7))