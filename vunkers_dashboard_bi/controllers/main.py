import json
import logging

from odoo import http
from odoo.http import request

_logger = logging.getLogger(__name__)


class VunkersDashboardController(http.Controller):

    @http.route('/vunkers/dashboard', type='http', auth='user', website=False)
    def dashboard_page(self, **kwargs):
        """Sirve la página completa del dashboard BI."""
        data = request.env['vunkers.dashboard.data'].generate_dashboard_data()
        data_json = json.dumps(data, ensure_ascii=False)

        # Información de cabecera
        months = data.get('months', [])
        if months:
            first = self._format_month_label(months[0])
            last = self._format_month_label(months[-1])
            date_range = f'{first} — {last}'
        else:
            date_range = ''

        return request.render(
            'vunkers_dashboard_bi.dashboard_page', {
                'data_json': data_json,
                'date_range': date_range,
                'source_label': data.get('source', ''),
            },
        )

    @http.route('/vunkers/dashboard/data', type='json', auth='user')
    def dashboard_data(self, **kwargs):
        """Endpoint JSON para refrescar datos sin recargar la página."""
        return request.env['vunkers.dashboard.data'].generate_dashboard_data()

    @staticmethod
    def _format_month_label(month_str):
        """Convierte '2025-01' a 'Ene 2025'."""
        import datetime
        try:
            d = datetime.date(int(month_str[:4]), int(month_str[5:7]), 1)
            month_names = [
                '', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
                'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
            ]
            return f'{month_names[d.month]} {d.year}'
        except (ValueError, IndexError):
            return month_str
