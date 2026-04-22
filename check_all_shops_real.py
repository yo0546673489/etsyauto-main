"""
עובר על כל החנויות המחוברות, קורא ל-Etsy API ישירות ומציג את הסיכום האמיתי.
מריצים בשרת: docker exec etsy-api python /app/check_all_shops_real.py
"""
import asyncio
from app.core.database import SessionLocal
from app.models.tenancy import Shop
from app.services.etsy_client import EtsyClient


async def main():
    db = SessionLocal()
    try:
        shops = (
            db.query(Shop)
            .filter(Shop.status == "connected")
            .filter(Shop.etsy_shop_id.isnot(None))
            .order_by(Shop.id)
            .all()
        )
        print(f"\n{'='*80}")
        print(f"בדיקת {len(shops)} חנויות מחוברות דרך Etsy /payment-account API")
        print(f"{'='*80}\n")

        etsy = EtsyClient(db)
        total_available = 0.0
        total_balance = 0.0
        currency_seen = None
        results = []
        failures = []

        for shop in shops:
            try:
                data = await etsy.get_payment_account(
                    shop_id=shop.id,
                    etsy_shop_id=shop.etsy_shop_id,
                )
                if not data or not isinstance(data, dict):
                    failures.append((shop.id, shop.shop_name, "no data"))
                    continue

                def extract(name):
                    obj = data.get(name)
                    if isinstance(obj, dict):
                        amt = obj.get("amount")
                        div = obj.get("divisor") or 100
                        ccy = obj.get("currency_code")
                        if amt is not None:
                            return float(amt) / float(div), ccy
                    return None, None

                available, ccy_a = extract("available_funds")
                balance, ccy_b = extract("ledger_balance")
                ccy = ccy_a or ccy_b or "ILS"
                currency_seen = currency_seen or ccy

                available = available or 0
                balance = balance or 0
                total_available += available
                total_balance += balance

                results.append({
                    "id": shop.id,
                    "name": shop.shop_name,
                    "available": available,
                    "balance": balance,
                    "currency": ccy,
                })
            except Exception as e:
                failures.append((shop.id, shop.shop_name, str(e)[:80]))

        # הדפסה
        print(f"{'ID':<5} {'שם':<30} {'יתרה':>15} {'זמין להפקדה':>18}")
        print("-" * 80)
        for r in results:
            print(f"{r['id']:<5} {(r['name'] or '')[:30]:<30} "
                  f"{r['currency']} {r['balance']:>10.2f} "
                  f"{r['currency']} {r['available']:>12.2f}")

        print("-" * 80)
        print(f"{'':<5} {'סה״כ':<30} {currency_seen or 'ILS'} {total_balance:>10.2f} "
              f"{currency_seen or 'ILS'} {total_available:>12.2f}")
        print(f"\n✅ חנויות הצליחו: {len(results)}")

        if failures:
            print(f"\n⚠️ כשלים ({len(failures)}):")
            for sid, sname, err in failures:
                print(f"   - shop {sid} ({sname}): {err}")

        print(f"\n{'='*80}")
        print(f"סכום כסף זמין להפקדה לכל החנויות: "
              f"{currency_seen or 'ILS'} {total_available:.2f}")
        print(f"סכום יתרה נוכחית לכל החנויות:      "
              f"{currency_seen or 'ILS'} {total_balance:.2f}")
        print(f"{'='*80}\n")

    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(main())
