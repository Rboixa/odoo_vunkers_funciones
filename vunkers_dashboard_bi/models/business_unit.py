from odoo import fields, models


class VunkersBusinessArea(models.Model):
    _name = 'vunkers.business.area'
    _description = 'Área de Negocio'
    _order = 'sequence, name'

    name = fields.Char(required=True)
    sequence = fields.Integer(default=10)
    business_unit_ids = fields.One2many(
        'vunkers.business.unit', 'area_id', string='Business Units',
    )


class VunkersBusinessUnit(models.Model):
    _name = 'vunkers.business.unit'
    _description = 'Business Unit'
    _order = 'sequence, name'

    name = fields.Char(
        required=True,
        help='Nombre normalizado del BU (ej: "Cloud", "Ciberseguridad")',
    )
    category_id = fields.Many2one(
        'product.category',
        string='Categoría de Producto (L1)',
        help='Categoría raíz de producto asociada a este BU',
    )
    area_id = fields.Many2one(
        'vunkers.business.area',
        string='Área de Negocio',
        help='Agrupación configurable de BUs',
    )
    color = fields.Char(
        default='#1e3a5f',
        help='Color hexadecimal para gráficas y tarjetas',
    )
    icon = fields.Char(
        help='Emoji o icono para la tarjeta del BU',
    )
    is_hidden = fields.Boolean(
        string='Oculto en Dashboard',
        help='Si se marca, este BU no aparece en el selector del dashboard',
    )
    sequence = fields.Integer(default=10)
    active = fields.Boolean(default=True)
    display_name_dashboard = fields.Char(
        string='Nombre en Dashboard',
        help='Nombre que se muestra en el dashboard (ej: "01 CIBERSEGURETAT"). '
             'Si vacío, usa el nombre de la categoría.',
    )

    def get_dashboard_label(self):
        """Returns the label shown in the dashboard BU list."""
        self.ensure_one()
        return self.display_name_dashboard or (
            self.category_id.name if self.category_id else self.name
        )
