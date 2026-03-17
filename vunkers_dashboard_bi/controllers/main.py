import json
import logging

from odoo import http
from odoo.http import request

_logger = logging.getLogger(__name__)


class VunkersDashboardController(http.Controller):

    @http.route('/vunkers/dashboard', type='http', auth='user', website=False)
    def dashboard_page(self, **kwargs):
        """Sirve la página del dashboard BI desde la cache."""
        DashData = request.env['vunkers.dashboard.data']
        data, meta = DashData.get_cached_data()
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
                'cache_generated_at': meta.get('generated_at', ''),
                'cache_record_count': meta.get('record_count', 0),
                'cache_generation_time': meta.get('generation_time_s', 0),
            },
        )

    @http.route('/vunkers/dashboard/data', type='json', auth='user')
    def dashboard_data(self, **kwargs):
        """Endpoint JSON-RPC: devuelve los datos cacheados."""
        DashData = request.env['vunkers.dashboard.data']
        data, meta = DashData.get_cached_data()
        return {'data': data, 'meta': meta}

    @http.route('/vunkers/dashboard/refresh', type='json', auth='user')
    def dashboard_refresh(self, **kwargs):
        """Endpoint JSON-RPC: regenera la cache y devuelve los datos nuevos."""
        DashData = request.env['vunkers.dashboard.data']
        data, meta = DashData.refresh_cache()
        return {'data': data, 'meta': meta}

    @http.route(
        '/vunkers/dashboard/refresh-redirect',
        type='http', auth='user', website=False,
    )
    def dashboard_refresh_redirect(self, **kwargs):
        """
        Regenera la cache y redirige al dashboard.
        Útil como enlace directo (botón HTML).
        """
        request.env['vunkers.dashboard.data'].refresh_cache()
        return request.redirect('/vunkers/dashboard')

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
