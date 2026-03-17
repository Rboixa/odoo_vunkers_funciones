import json
import logging
from collections import defaultdict
from datetime import date

from dateutil.relativedelta import relativedelta

from odoo import api, models

_logger = logging.getLogger(__name__)


class VunkersDashboardData(models.AbstractModel):
    _name = 'vunkers.dashboard.data'
    _description = 'Generador de datos para Dashboard BI'

    # ── helpers ──────────────────────────────────────────────────────────

    def _get_category_path(self, categ):
        """Devuelve la jerarquía de categoría como lista [L1, L2, L3, ...]."""
        path = []
        c = categ
        while c:
            path.insert(0, c)
            c = c.parent_id
        return path

    def _build_bu_map(self):
        """Construye dict {product.category.id: vunkers.business.unit record}."""
        bus = self.env['vunkers.business.unit'].search([])
        return {bu.category_id.id: bu for bu in bus if bu.category_id}

    def _build_service_type_map(self):
        """Construye dict {vunkers.service.type.id: name}."""
        types = self.env['vunkers.service.type'].search([])
        return {t.id: t.name for t in types}

    # ── main data generation ─────────────────────────────────────────────

    @api.model
    def generate_dashboard_data(self, months_back=15):
        """
        Genera la estructura DATA completa para el dashboard BI.
        Extrae datos de account.analytic.line de los últimos `months_back` meses.
        """
        today = date.today()
        date_from = (today - relativedelta(months=months_back - 1)).replace(day=1)
        date_to = today

        # ── 1. Obtener líneas analíticas ─────────────────────────────────
        AnalyticLine = self.env['account.analytic.line']
        lines = AnalyticLine.search([
            ('date', '>=', date_from),
            ('date', '<=', date_to),
            ('amount', '!=', 0),
        ])
        _logger.info(
            'Dashboard BI: %d líneas analíticas desde %s hasta %s',
            len(lines), date_from, date_to,
        )

        # ── 2. Configuración de BU y tipos ───────────────────────────────
        bu_map = self._build_bu_map()  # categ_id -> BU record
        stype_map = self._build_service_type_map()

        # Cargar suscripciones activas para estadísticas
        subs_data = self._get_subscription_stats()

        # ── 3. Construir lookup tables y registros compactos ─────────────
        months_set = set()
        partners_idx = {}  # partner_id -> index
        partners_list = []
        partner_ids_list = []
        products_idx = {}
        products_list = []
        cats_idx = {}  # L1 category name -> index
        cats_list = []
        sub1s_idx = {}
        sub1s_list = []
        sub2s_idx = {}
        sub2s_list = []
        bus_idx = {}  # BU normalized name -> index
        bus_list_lk = []
        bas_idx = {}
        bas_list = []
        tipos_idx = {}
        tipos_list = []
        accts_idx = {}
        accts_list = []

        def _get_or_add(val, idx_dict, val_list):
            if val not in idx_dict:
                idx_dict[val] = len(val_list)
                val_list.append(val)
            return idx_dict[val]

        # Sentinel for no-value
        NO_VAL = '(Sin asignar)'
        _get_or_add(NO_VAL, cats_idx, cats_list)
        _get_or_add(NO_VAL, sub1s_idx, sub1s_list)
        _get_or_add(NO_VAL, sub2s_idx, sub2s_list)
        _get_or_add(NO_VAL, bus_idx, bus_list_lk)
        _get_or_add(NO_VAL, bas_idx, bas_list)
        _get_or_add(NO_VAL, tipos_idx, tipos_list)

        records = []
        filter_tree = defaultdict(lambda: defaultdict(lambda: defaultdict(set)))

        for line in lines:
            month_str = line.date.strftime('%Y-%m')
            months_set.add(month_str)

            amount = line.amount

            # Partner
            partner = line.partner_id
            if partner and partner.id:
                if partner.id not in partners_idx:
                    partners_idx[partner.id] = len(partners_list)
                    partners_list.append(partner.display_name or partner.name or '')
                    partner_ids_list.append(partner.id)
                partner_i = partners_idx[partner.id]
            else:
                partner_i = -1

            # Product & category hierarchy
            product = line.product_id
            product_tmpl = product.product_tmpl_id if product else False
            if product and product.id:
                prod_name = product.display_name or product.name or ''
                product_i = _get_or_add(prod_name, products_idx, products_list)
            else:
                product_i = -1

            # Category hierarchy from product
            cat_name = NO_VAL
            sub1_name = NO_VAL
            sub2_name = NO_VAL
            if product_tmpl and product_tmpl.categ_id:
                path = self._get_category_path(product_tmpl.categ_id)
                cat_name = path[0].name if len(path) > 0 else NO_VAL
                sub1_name = path[1].name if len(path) > 1 else NO_VAL
                sub2_name = path[2].name if len(path) > 2 else NO_VAL

            cat_i = _get_or_add(cat_name, cats_idx, cats_list)
            sub1_i = _get_or_add(sub1_name, sub1s_idx, sub1s_list)
            sub2_i = _get_or_add(sub2_name, sub2s_idx, sub2s_list)

            # Subscription flag
            is_sub = 0
            if product_tmpl and hasattr(product_tmpl, 'recurring_invoice'):
                is_sub = 1 if product_tmpl.recurring_invoice else 0

            # BU (from configuration)
            bu_name = NO_VAL
            ba_name = NO_VAL
            if product_tmpl and product_tmpl.categ_id:
                root_categ = self._get_category_path(product_tmpl.categ_id)[0]
                bu_rec = bu_map.get(root_categ.id)
                if bu_rec:
                    bu_name = bu_rec.name
                    ba_name = bu_rec.area_id.name if bu_rec.area_id else NO_VAL

            bu_i = _get_or_add(bu_name, bus_idx, bus_list_lk)
            ba_i = _get_or_add(ba_name, bas_idx, bas_list)

            # Service type
            tipo_name = NO_VAL
            if product_tmpl and product_tmpl.vunkers_service_type_id:
                tipo_name = stype_map.get(
                    product_tmpl.vunkers_service_type_id.id, NO_VAL
                )
            tipo_i = _get_or_add(tipo_name, tipos_idx, tipos_list)

            # Accounting account
            acct_name = NO_VAL
            if hasattr(line, 'general_account_id') and line.general_account_id:
                acct = line.general_account_id
                acct_name = f'{acct.code} {acct.name}'
            elif hasattr(line, 'move_line_id') and line.move_line_id:
                acct = line.move_line_id.account_id
                if acct:
                    acct_name = f'{acct.code} {acct.name}'
            acct_i = _get_or_add(acct_name, accts_idx, accts_list)

            # Build filter tree
            prod_label = products_list[product_i] if product_i >= 0 else ''
            if prod_label:
                filter_tree[cat_name][sub1_name][sub2_name].add(prod_label)

            # Compact record
            month_i = None  # will be resolved after sorting months
            records.append([
                month_str, amount, partner_i, product_i,
                cat_i, sub1_i, sub2_i, is_sub,
                bu_i, ba_i, tipo_i, acct_i,
            ])

        # ── 4. Sort months and resolve month indices ─────────────────────
        months_sorted = sorted(months_set)
        month_idx_map = {m: i for i, m in enumerate(months_sorted)}

        compact_records = []
        for rec in records:
            mi = month_idx_map[rec[0]]
            compact_records.append([
                mi, rec[1], rec[2], rec[3],
                rec[4], rec[5], rec[6], rec[7],
                rec[8], rec[9], rec[10], rec[11],
            ])

        # ── 5. Build filter_tree as serializable dict ────────────────────
        ft_serializable = {}
        for cat, sub1_dict in filter_tree.items():
            ft_serializable[cat] = {}
            for sub1, sub2_dict in sub1_dict.items():
                ft_serializable[cat][sub1] = {}
                for sub2, prods in sub2_dict.items():
                    ft_serializable[cat][sub1][sub2] = sorted(prods)

        # ── 6. Build aggregated data ─────────────────────────────────────

        # Monthly billing
        monthly_billing = {}
        for m in months_sorted:
            mi = month_idx_map[m]
            m_recs = [r for r in compact_records if r[0] == mi]
            total = sum(r[1] for r in m_recs)
            mrr = sum(r[1] for r in m_recs if r[7] == 1)
            project = sum(r[1] for r in m_recs if r[7] == 0)
            monthly_billing[m] = {
                'total': round(total, 2),
                'MRR': round(mrr, 2),
                'Project': round(project, 2),
            }

        # BU list for dashboard (with TOTAL)
        bu_configs = self.env['vunkers.business.unit'].search(
            [('is_hidden', '=', False)], order='sequence, name',
        )
        bu_list = ['TOTAL']
        for bu_conf in bu_configs:
            label = bu_conf.get_dashboard_label()
            bu_list.append(label)

        # BU cards with subscription stats
        bu_cards = self._build_bu_cards(
            compact_records, months_sorted, month_idx_map,
            cats_list, cats_idx, bus_list_lk, bus_idx,
            bu_list, subs_data,
        )

        # Client directory
        client_directory = self._build_client_directory(
            compact_records, months_sorted, month_idx_map,
            partners_list, partner_ids_list, bus_list_lk,
            products_list,
        )

        # Top clients & categories
        top_clients = sorted(client_directory, key=lambda c: c['total'], reverse=True)[:50]
        top_clients = [{'name': c['name'], 'total': c['total']} for c in top_clients]

        top_categories = self._build_top_categories(
            compact_records, cats_list, sub1s_list, sub2s_list,
        )

        # Product trend
        product_trend = self._build_product_trend(
            compact_records, months_sorted, month_idx_map, products_list,
        )

        # Active clients per month
        active_clients = {}
        for m in months_sorted:
            mi = month_idx_map[m]
            pids = set()
            for r in compact_records:
                if r[0] == mi and r[7] == 1 and r[2] >= 0:
                    pids.add(r[2])
            active_clients[m] = len(pids)

        # ── 7. Assemble final DATA ───────────────────────────────────────
        data = {
            'source': 'account.analytic.line (PRODUCCIÓN)',
            'months': months_sorted,
            'monthly_billing': monthly_billing,
            'bu_list': bu_list,
            'bu_cards': bu_cards,
            'filter_tree': ft_serializable,
            'client_directory': client_directory[:300],
            'top_clients': top_clients,
            'top_categories': top_categories[:20],
            'product_trend': product_trend,
            'active_clients': active_clients,
            '_lk': {
                'months': months_sorted,
                'partners': partners_list,
                'partner_ids': partner_ids_list,
                'products': products_list,
                'cats': cats_list,
                'bus': bus_list_lk,
                'bas': bas_list,
                'sub1s': sub1s_list,
                'sub2s': sub2s_list,
                'tipos': tipos_list,
                'accts': accts_list,
            },
            '_rc': compact_records,
        }
        return data

    # ── subscription stats ───────────────────────────────────────────────

    def _get_subscription_stats(self):
        """
        Obtiene estadísticas de suscripciones desde sale.order (Odoo 18 Enterprise).
        Retorna dict por categoría raíz con conteos de estado y plan.
        """
        result = defaultdict(lambda: {
            'subs_state': defaultdict(int),
            'subs_plan': defaultdict(int),
        })

        SaleOrder = self.env['sale.order']
        if not hasattr(SaleOrder, 'is_subscription'):
            return result

        subs = SaleOrder.search([
            ('is_subscription', '=', True),
            ('state', 'in', ['sale', 'done']),
        ])

        plan_map = {
            'month': 'Mensual',
            'quarter': 'Trimestral',
            'semester': 'Semestral',
            'year': 'Anual',
            '2_years': 'Bianual',
            '3_years': 'Trianual',
        }

        state_map = {
            '2_renewed': 'Renovada',
            '3_progress': 'Activa',
            '4_paused': 'Pausada',
            '5_renewed': 'Renovada',
            '6_churn': 'Cancelada',
            '7_upsell': 'En renovación',
        }

        bu_map = self._build_bu_map()

        for sub in subs:
            # Determine BU from subscription order lines
            bu_label = 'TOTAL'
            for sol in sub.order_line:
                if sol.product_id and sol.product_id.categ_id:
                    path = self._get_category_path(sol.product_id.categ_id)
                    if path:
                        root_categ = path[0]
                        bu_rec = bu_map.get(root_categ.id)
                        if bu_rec:
                            bu_label = bu_rec.get_dashboard_label()
                            break

            # State
            sub_state = 'Activa'
            if hasattr(sub, 'subscription_state') and sub.subscription_state:
                sub_state = state_map.get(
                    sub.subscription_state, sub.subscription_state
                )
            elif hasattr(sub, 'stage_id') and sub.stage_id:
                sub_state = sub.stage_id.name or 'Activa'

            result[bu_label]['subs_state'][sub_state] += 1
            result['TOTAL']['subs_state'][sub_state] += 1

            # Plan frequency
            plan_label = 'Mensual'
            if hasattr(sub, 'recurrence_id') and sub.recurrence_id:
                rec_name = (sub.recurrence_id.name or '').lower()
                for key, label in plan_map.items():
                    if key in rec_name:
                        plan_label = label
                        break
            elif hasattr(sub, 'plan_id') and sub.plan_id:
                plan_name = (sub.plan_id.name or '').lower()
                for key, label in plan_map.items():
                    if key in plan_name:
                        plan_label = label
                        break

            result[bu_label]['subs_plan'][plan_label] += 1
            result['TOTAL']['subs_plan'][plan_label] += 1

        return result

    # ── BU cards ─────────────────────────────────────────────────────────

    def _build_bu_cards(self, records, months, month_map, cats_list,
                        cats_idx, bus_list, bus_idx, bu_list, subs_data):
        """Construye bu_cards con monthly_mrr, mrr_td, mrr_prev, arr, etc."""
        cards = {}
        hidden_bu_configs = self.env['vunkers.business.unit'].search(
            [('is_hidden', '=', True)]
        )
        hidden_cat_names = set()
        for bu_conf in hidden_bu_configs:
            if bu_conf.category_id:
                hidden_cat_names.add(bu_conf.category_id.name)
            if bu_conf.display_name_dashboard:
                hidden_cat_names.add(bu_conf.display_name_dashboard)

        for bu_label in bu_list:
            is_total = bu_label == 'TOTAL'

            # Filter records for this BU
            if is_total:
                # Exclude hidden categories
                hidden_idxs = set()
                for hname in hidden_cat_names:
                    if hname in cats_idx:
                        hidden_idxs.add(cats_idx[hname])
                bu_recs = [r for r in records if r[4] not in hidden_idxs]
            else:
                cat_i = cats_idx.get(bu_label, -1)
                bu_recs = [r for r in records if r[4] == cat_i]

            # Monthly MRR
            monthly_mrr = {}
            for m in months:
                mi = month_map[m]
                monthly_mrr[m] = round(
                    sum(r[1] for r in bu_recs if r[0] == mi and r[7] == 1), 2
                )

            # Current period MRR
            last_month = months[-1] if months else ''
            mrr_td = monthly_mrr.get(last_month, 0)

            # Previous month MRR
            prev_month_idx = len(months) - 2
            mrr_prev = monthly_mrr.get(
                months[prev_month_idx], 0
            ) if prev_month_idx >= 0 else 0

            # Same month last year
            if last_month:
                y, m_num = last_month.split('-')
                prev_year_month = f'{int(y) - 1}-{m_num}'
                mrr_prev_year = monthly_mrr.get(prev_year_month, 0)
            else:
                mrr_prev_year = 0

            arr = round(mrr_td * 12, 2)

            # Subscription stats from sale.order
            sub_stats = subs_data.get(bu_label, {
                'subs_state': {},
                'subs_plan': {},
            })

            cards[bu_label] = {
                'monthly_mrr': monthly_mrr,
                'mrr_td': round(mrr_td, 2),
                'mrr_prev': round(mrr_prev, 2),
                'mrr_prev_year': round(mrr_prev_year, 2),
                'arr': arr,
                'subs_state': dict(sub_stats['subs_state']),
                'subs_plan': dict(sub_stats['subs_plan']),
            }

        return cards

    # ── client directory ─────────────────────────────────────────────────

    def _build_client_directory(self, records, months, month_map,
                                partners_list, partner_ids_list,
                                bus_list, products_list):
        """Construye la lista de clientes con totales, BUs, productos y monthly."""
        client_data = defaultdict(lambda: {
            'total': 0,
            'bus': defaultdict(float),
            'products': defaultdict(float),
            'monthly': defaultdict(float),
        })

        for r in records:
            if r[2] < 0:
                continue
            p_idx = r[2]
            p_name = partners_list[p_idx]
            amount = r[1]
            month = months[r[0]] if r[0] < len(months) else ''

            client_data[p_name]['total'] += amount
            bu_name = bus_list[r[8]] if r[8] < len(bus_list) else ''
            if bu_name:
                client_data[p_name]['bus'][bu_name] += amount
            prod_name = products_list[r[3]] if r[3] >= 0 and r[3] < len(products_list) else ''
            if prod_name:
                client_data[p_name]['products'][prod_name] += amount
            if month:
                client_data[p_name]['monthly'][month] += amount

        directory = []
        for name, data in client_data.items():
            bus_sorted = sorted(
                data['bus'].items(), key=lambda x: x[1], reverse=True,
            )
            prods_sorted = sorted(
                data['products'].items(), key=lambda x: x[1], reverse=True,
            )
            directory.append({
                'name': name,
                'total': round(data['total'], 2),
                'bus': [
                    {'name': b, 'amount': round(a, 2)}
                    for b, a in bus_sorted[:6]
                ],
                'products': [
                    {'name': p, 'amount': round(a, 2)}
                    for p, a in prods_sorted[:5]
                ],
                'monthly': {
                    m: round(v, 2)
                    for m, v in sorted(data['monthly'].items())
                },
            })

        directory.sort(key=lambda c: c['total'], reverse=True)
        return directory

    # ── top categories ───────────────────────────────────────────────────

    def _build_top_categories(self, records, cats_list, sub1s_list, sub2s_list):
        """Construye ranking de categorías con path completo."""
        cat_totals = defaultdict(float)
        for r in records:
            cat = cats_list[r[4]] if r[4] < len(cats_list) else ''
            sub1 = sub1s_list[r[5]] if r[5] < len(sub1s_list) else ''
            sub2 = sub2s_list[r[6]] if r[6] < len(sub2s_list) else ''
            path_parts = [p for p in [cat, sub1, sub2] if p and p != '(Sin asignar)']
            path = ' / '.join(path_parts) if path_parts else '(Sin categoría)'
            cat_totals[path] += r[1]

        result = sorted(
            [{'name': k, 'total': round(v, 2)} for k, v in cat_totals.items()],
            key=lambda x: x['total'],
            reverse=True,
        )
        return result

    # ── product trend ────────────────────────────────────────────────────

    def _build_product_trend(self, records, months, month_map, products_list):
        """
        Compara facturación por producto: periodo actual vs anterior.
        Divide los meses en dos mitades para comparar.
        """
        if len(months) < 2:
            return []

        mid = len(months) // 2
        prev_months = set(range(0, mid))
        curr_months = set(range(mid, len(months)))

        prod_prev = defaultdict(float)
        prod_curr = defaultdict(float)

        for r in records:
            if r[3] < 0:
                continue
            prod_name = products_list[r[3]] if r[3] < len(products_list) else ''
            if not prod_name:
                continue
            if r[0] in prev_months:
                prod_prev[prod_name] += r[1]
            elif r[0] in curr_months:
                prod_curr[prod_name] += r[1]

        all_prods = set(prod_prev.keys()) | set(prod_curr.keys())
        trend = []
        for p in all_prods:
            prev = round(prod_prev.get(p, 0), 2)
            curr = round(prod_curr.get(p, 0), 2)
            diff = round(curr - prev, 2)
            trend.append({
                'name': p,
                'prev': prev,
                'curr': curr,
                'diff': diff,
            })

        trend.sort(key=lambda x: x['diff'], reverse=True)
        return trend
