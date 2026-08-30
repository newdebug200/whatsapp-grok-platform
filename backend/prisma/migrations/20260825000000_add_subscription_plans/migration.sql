-- CreateTable
CREATE TABLE "SubscriptionPlan" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "price" REAL NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "credits" REAL NOT NULL DEFAULT 0,
    "duration_days" INTEGER NOT NULL DEFAULT 30,
    "max_profiles" INTEGER NOT NULL DEFAULT 1,
    "features" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlan_slug_key" ON "SubscriptionPlan"("slug");
CREATE INDEX "SubscriptionPlan_is_active_sort_order_idx" ON "SubscriptionPlan"("is_active", "sort_order");

-- Default plans are intentionally not inserted automatically; the administrator defines the commercial offers.
