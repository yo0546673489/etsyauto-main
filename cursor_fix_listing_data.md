# Cursor Prompt — Fix `_prepare_listing_data` for Etsy API v3

## Context
`apps/api/app/worker/tasks/listing_tasks.py`

The `_prepare_listing_data` function is sending fields that Etsy v3 does not accept
on `POST /application/shops/{shop_id}/listings` (create draft). This causes 400 errors
like `readiness_state_id is required` or unexpected field rejections.

---

## Fix

Replace the entire `_prepare_listing_data` function body with this — only send fields
that Etsy v3 accepts on draft listing creation:

```python
def _prepare_listing_data(product: Product, shop: Shop) -> Dict[str, Any]:
    """
    Prepare Etsy v3 listing payload. Only includes fields accepted by
    POST /application/shops/{etsy_shop_id}/listings.
    """
    title = (product.title_raw or "").strip()[:140]
    description = (product.description_raw or "").strip()
    tags = product.tags_raw[:13] if product.tags_raw else []

    price = round(product.price / 100.0, 2) if product.price else 0.00

    listing_data = {
        # Required fields
        "quantity": product.quantity or 1,
        "title": title,
        "description": description,
        "price": price,
        "who_made": product.who_made or "i_did",
        "when_made": product.when_made or "made_to_order",
        "taxonomy_id": product.taxonomy_id or 1,
        "shipping_profile_id": shop.default_shipping_profile_id,

        # Optional but commonly accepted
        "tags": tags,
        "materials": product.materials or [],
        "is_supply": product.is_supply or False,
        "is_customizable": product.is_customizable or False,
        "should_auto_renew": True,
        "is_taxable": True,
        "type": "physical",
        "processing_min": product.processing_min or 1,
        "processing_max": product.processing_max or 3,
    }

    # Only include return_policy_id if set
    if shop.default_return_policy_id:
        listing_data["return_policy_id"] = shop.default_return_policy_id

    # Only include shop_section_id if set
    shop_section_id = None
    if product.variants and isinstance(product.variants, dict):
        shop_section_id = product.variants.get("shop_section_id")
    if shop_section_id:
        listing_data["shop_section_id"] = shop_section_id

    # Only include personalization fields if product is personalizable
    if product.is_personalizable:
        listing_data["is_personalizable"] = True
        listing_data["personalization_is_required"] = True
        listing_data["personalization_char_count_max"] = 100
        listing_data["personalization_instructions"] = (
            product.personalization_instructions or ""
        )

    # Only include dimensions if set
    if product.item_weight:
        listing_data["item_weight"] = product.item_weight
        listing_data["item_weight_unit"] = product.item_weight_unit or "oz"
    if product.item_length:
        listing_data["item_length"] = product.item_length
        listing_data["item_width"] = product.item_width
        listing_data["item_height"] = product.item_height
        listing_data["item_dimensions_unit"] = product.item_dimensions_unit or "in"

    return listing_data
```

## Key changes
- Removed `readiness_state_id` (not a valid v3 draft creation field)
- Removed `personalization_char_count_max` / `personalization_instructions` when not personalizable
- Removed `styles` (not needed)
- Optional fields only included when they have actual values
- Dimensions only sent when set (avoids null field rejections)
