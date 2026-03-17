from odoo import fields, models


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    vunkers_service_type_id = fields.Many2one(
        'vunkers.service.type',
        string='Tipo de Servicio (BI)',
        help='Clasificación para el dashboard BI: Producto, Software, Servicios, etc.',
    )
