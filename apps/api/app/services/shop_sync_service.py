from sqlalchemy.orm import Session
from app.models.tenancy import Shop
from app.services.etsy_client import EtsyClient


async def sync_shop_defaults(db: Session, shop: Shop) -> None:
  """Fetch and store shipping profile and return policy IDs from Etsy."""
  if not shop or not shop.etsy_shop_id:
    return

  # Initialize Etsy client
  etsy_client = EtsyClient(db)

  # Fetch shipping profiles and store first active profile ID
  try:
    profiles = await etsy_client.get_shipping_profiles(shop.id, shop.etsy_shop_id)
    active = next((p for p in profiles if p.get("is_deleted") is False), None)
    if active and active.get("shipping_profile_id"):
      shop.default_shipping_profile_id = active["shipping_profile_id"]
  except Exception:
    # Don't fail the whole flow if Etsy call fails; leave defaults unchanged
    pass

  # TODO: When return policies endpoint is available, fetch and set default_return_policy_id here.

  db.commit()

