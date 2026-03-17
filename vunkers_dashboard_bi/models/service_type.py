from odoo import fields, models


class VunkersServiceType(models.Model):
    _name = 'vunkers.service.type'
    _description = 'Tipo de Servicio'
    _order = 'sequence, name'

    name = fields.Char(required=True)
    sequence = fields.Integer(default=10)
    active = fields.Boolean(default=True)
