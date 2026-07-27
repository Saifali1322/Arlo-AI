#!/usr/bin/env python3
"""
Price a recruitment agency from its own metrics.

Three independent numbers decide the price, and the recommendation is where
they overlap:

  FLOOR    what it costs us to run, per month (Retell minutes + overhead + support)
  CEILING  what they can afford  (a share of NET fee income, not headline turnover)
  VALUE    what it's worth to them (extra placements x fee), of which we take a cut

Usage:
    python3 scripts/price_agency.py --consultants 10 --fee 7000 --desk perm
    python3 scripts/price_agency.py --consultants 25 --fee 9000 --desk temp --calls-per-desk 9
"""
import argparse

USD_GBP = 0.79          # $ -> £
RETELL_PER_MIN_USD = 0.13   # Retell voice + GPT-4.1 + telephony, all-in
RETELL_NUMBER_USD = 2.0     # per month, per number

# --- what a desk is worth -------------------------------------------------
# Perm: billings ARE fee income. Temp: headline turnover is mostly pass-through
# wages, so we price off the margin, not the turnover.
BILLINGS = {"perm": 150_000, "temp": 300_000}
NET_FEE_SHARE = {"perm": 1.0, "temp": 0.18}

AFFORD_BAND = (0.02, 0.05)   # share of NET fee income a vendor can take
CAPTURE_BAND = (0.10, 0.25)  # share of created value we can capture


def model(consultants, fee, desk, calls_per_desk, mins_per_call,
          uplift_per_quarter, support_hours, support_rate, n8n_share):
    # ---- FLOOR: cost to deliver -----------------------------------------
    inbound_min = consultants * calls_per_desk * mins_per_call * 22
    outbound_min = consultants * 30 * 2.5          # database reactivation + chasing
    total_min = inbound_min + outbound_min
    retell = (total_min * RETELL_PER_MIN_USD + RETELL_NUMBER_USD) * USD_GBP
    support = support_hours * support_rate
    floor = retell + support + n8n_share

    # ---- CEILING: what they can afford ----------------------------------
    gross = consultants * BILLINGS[desk]
    net_fee_income = gross * NET_FEE_SHARE[desk]
    afford_lo = net_fee_income * AFFORD_BAND[0] / 12
    afford_hi = net_fee_income * AFFORD_BAND[1] / 12

    # ---- VALUE: what it's worth to them ---------------------------------
    extra_placements = consultants * uplift_per_quarter * 4
    value = extra_placements * fee
    cap_lo = value * CAPTURE_BAND[0] / 12
    cap_hi = value * CAPTURE_BAND[1] / 12

    # ---- RECOMMENDATION --------------------------------------------------
    # Sit inside affordability, take a defensible slice of value, never near floor.
    lo = max(floor * 3, min(afford_lo, cap_lo))
    hi = min(afford_hi, cap_hi)
    if hi < lo:                      # bands don't overlap - affordability wins
        hi = max(lo, afford_hi)
    rec = round((lo + hi) / 2 / 250) * 250
    build = round(rec * 3 / 500) * 500   # build fee ~3x monthly

    return dict(total_min=total_min, floor=floor, retell=retell,
                gross=gross, net_fee_income=net_fee_income,
                afford_lo=afford_lo, afford_hi=afford_hi,
                extra_placements=extra_placements, value=value,
                cap_lo=cap_lo, cap_hi=cap_hi,
                rec=rec, build=build,
                margin=(rec - floor) / rec * 100,
                year_one=build + rec * 12,
                payback=value / (build + rec * 12) if (build + rec * 12) else 0)


def show(a, m):
    print(f"\n{'='*66}")
    print(f"  {a.consultants} consultants · {a.desk} · £{a.fee:,.0f} average fee")
    print(f"{'='*66}")
    print(f"  Call volume        {m['total_min']:,.0f} min/mo")
    print(f"  FLOOR (our cost)   £{m['floor']:,.0f}/mo   (Retell £{m['retell']:,.0f} + support + tooling)")
    print(f"  Net fee income     £{m['net_fee_income']:,.0f}/yr")
    print(f"  CEILING (afford)   £{m['afford_lo']:,.0f} – £{m['afford_hi']:,.0f}/mo   (2–5% of fee income)")
    print(f"  VALUE created      £{m['value']:,.0f}/yr   ({m['extra_placements']:.0f} extra placements)")
    print(f"  Capture band       £{m['cap_lo']:,.0f} – £{m['cap_hi']:,.0f}/mo   (10–25% of value)")
    print(f"  {'-'*62}")
    print(f"  → CHARGE           £{m['build']:,.0f} build  +  £{m['rec']:,.0f}/mo")
    print(f"    Year one         £{m['year_one']:,.0f}   ·  gross margin {m['margin']:.0f}%")
    print(f"    Their return     {m['payback']:.1f}x on year one")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--consultants", type=int, default=10)
    # NOTE on --fee for temp desks: a temp "placement" earns margin per hour over
    # the length of the assignment, not a one-off fee. For --desk temp, pass the
    # expected LIFETIME margin per contractor placed (e.g. £4/hr x 37.5hr x 20wk
    # = £3,000), not a perm-style fee. Passing a perm fee here overstates value.
    p.add_argument("--fee", type=float, default=7000)
    p.add_argument("--desk", choices=["perm", "temp"], default="perm")
    p.add_argument("--calls-per-desk", type=float, default=6,
                   help="inbound calls per consultant per day")
    p.add_argument("--mins-per-call", type=float, default=3)
    p.add_argument("--uplift-per-quarter", type=float, default=1,
                   help="extra placements per consultant per quarter (be conservative)")
    p.add_argument("--support-hours", type=float, default=4)
    p.add_argument("--support-rate", type=float, default=60)
    p.add_argument("--n8n-share", type=float, default=10)
    p.add_argument("--grid", action="store_true", help="print the full size grid")
    a = p.parse_args()

    if a.grid:
        print(f"\n{'Desks':>6} {'Fee':>8} {'Type':>5} {'Floor':>8} {'Afford/mo':>18} "
              f"{'Build':>8} {'Monthly':>9} {'Yr1':>9} {'Margin':>7}")
        print("-" * 84)
        for desk in ("perm", "temp"):
            for n in (5, 10, 20, 30, 40):
                for fee in (5000, 8000):
                    a.desk, a.consultants, a.fee = desk, n, fee
                    m = model(n, fee, desk, a.calls_per_desk, a.mins_per_call,
                              a.uplift_per_quarter, a.support_hours,
                              a.support_rate, a.n8n_share)
                    print(f"{n:>6} {fee:>8,.0f} {desk:>5} £{m['floor']:>6,.0f} "
                          f"£{m['afford_lo']:>7,.0f}–£{m['afford_hi']:<8,.0f} "
                          f"£{m['build']:>6,.0f} £{m['rec']:>7,.0f} "
                          f"£{m['year_one']:>7,.0f} {m['margin']:>6.0f}%")
            print()
    else:
        show(a, model(a.consultants, a.fee, a.desk, a.calls_per_desk,
                      a.mins_per_call, a.uplift_per_quarter,
                      a.support_hours, a.support_rate, a.n8n_share))
