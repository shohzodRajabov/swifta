-- Data fix: movements recorded without a net (VAT-free) unit cost got 0, which made issued materials
-- cost nothing for legal entities under the general tax regime. Only empty net costs are filled.

-- 1) Receipts from purchase orders: net from the order's VAT rate.
UPDATE "StockMovement" m
SET "unitCostNetUzs" = ROUND(m."unitCostUzs" * 100 / (100 + o."vatRate"), 2),
    "unitCostNetUsd" = ROUND(m."unitCostUsd" * 100 / (100 + o."vatRate"), 4),
    "vatRate" = o."vatRate"
FROM "PurchaseOrderLine" l
JOIN "PurchaseOrder" o ON o.id = l."orderId"
WHERE m."poLineId" = l.id AND m."unitCostNetUzs" = 0 AND m."unitCostUzs" > 0;

-- 2) Other movements of a product: use the net/gross ratio of that product's receipts.
UPDATE "StockMovement" m
SET "unitCostNetUzs" = ROUND(m."unitCostUzs" * r.k, 2),
    "unitCostNetUsd" = ROUND(m."unitCostUsd" * r.k, 4)
FROM (
  SELECT "productId", SUM("qty" * "unitCostNetUzs") / NULLIF(SUM("qty" * "unitCostUzs"), 0) AS k
  FROM "StockMovement"
  WHERE "type" = 'RECEIPT' AND "unitCostNetUzs" > 0 AND "unitCostUzs" > 0
  GROUP BY "productId"
) r
WHERE m."productId" = r."productId" AND r.k IS NOT NULL AND m."unitCostNetUzs" = 0 AND m."unitCostUzs" > 0;

-- 3) Anything left: treat as VAT-free (net = gross) rather than zero cost.
UPDATE "StockMovement"
SET "unitCostNetUzs" = "unitCostUzs", "unitCostNetUsd" = "unitCostUsd"
WHERE "unitCostNetUzs" = 0 AND "unitCostUzs" > 0;
