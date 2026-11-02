"""
从 olist.db 提取看板所需的聚合数据，导出为 website/data.json
"""
import sqlite3
import json
from pathlib import Path

DB = Path(__file__).resolve().parent.parent / "data" / "olist.db"
OUT = Path(__file__).resolve().parent / "data.json"
OUT_JS = Path(__file__).resolve().parent / "js" / "data.js"

conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row


def q(sql):
    cur = conn.execute(sql)
    return [dict(r) for r in cur.fetchall()]


data = {}

# ---------- 1. 全局 KPI ----------
data["kpi"] = {
    "delivered_orders": q(
        "SELECT COUNT(*) AS n FROM olist_orders_dataset WHERE order_status='delivered'"
    )[0]["n"],
    "merchandise_sales": round(q(
        """SELECT SUM(i.price) AS s FROM olist_orders_dataset o
           JOIN olist_order_items_dataset i ON o.order_id=i.order_id
           WHERE o.order_status='delivered'"""
    )[0]["s"] or 0, 2),
    "freight_total": round(q(
        """SELECT SUM(i.freight_value) AS s FROM olist_orders_dataset o
           JOIN olist_order_items_dataset i ON o.order_id=i.order_id
           WHERE o.order_status='delivered'"""
    )[0]["s"] or 0, 2),
    "avg_order_value": round(q(
        """SELECT AVG(t.s) AS a FROM (
             SELECT o.order_id, SUM(i.price) AS s
             FROM olist_orders_dataset o JOIN olist_order_items_dataset i ON o.order_id=i.order_id
             WHERE o.order_status='delivered' GROUP BY o.order_id) t"""
    )[0]["a"] or 0, 2),
    "avg_review_score": round(q(
        "SELECT AVG(review_score) AS a FROM olist_order_reviews_dataset"
    )[0]["a"] or 0, 2),
    "customers": q(
        "SELECT COUNT(DISTINCT customer_unique_id) AS n FROM olist_customers_dataset"
    )[0]["n"],
    "sellers": q(
        "SELECT COUNT(DISTINCT seller_id) AS n FROM olist_sellers_dataset"
    )[0]["n"],
    "products": q(
        "SELECT COUNT(DISTINCT product_id) AS n FROM olist_products_dataset"
    )[0]["n"],
    "categories": q(
        "SELECT COUNT(DISTINCT product_category_name) AS n FROM olist_products_dataset WHERE product_category_name IS NOT NULL"
    )[0]["n"],
    "states": q(
        "SELECT COUNT(DISTINCT customer_state) AS n FROM olist_customers_dataset"
    )[0]["n"],
    "date_min": q(
        "SELECT MIN(order_purchase_timestamp) AS m FROM olist_orders_dataset"
    )[0]["m"],
    "date_max": q(
        "SELECT MAX(order_purchase_timestamp) AS m FROM olist_orders_dataset"
    )[0]["m"],
}

# 延迟率 / 复购率
data["delay_rate"] = round(q(
    """SELECT AVG(CASE WHEN order_delivered_customer_date > order_estimated_delivery_date THEN 1.0 ELSE 0.0 END) AS r
       FROM olist_orders_dataset
       WHERE order_status='delivered' AND order_delivered_customer_date IS NOT NULL
         AND order_estimated_delivery_date IS NOT NULL"""
)[0]["r"] or 0, 4)

data["repeat_rate"] = round(q(
    """WITH c AS (
         SELECT c.customer_unique_id, COUNT(o.order_id) AS cnt
         FROM olist_customers_dataset c LEFT JOIN olist_orders_dataset o
           ON c.customer_id=o.customer_id AND o.order_status='delivered'
         GROUP BY c.customer_unique_id)
       SELECT AVG(CASE WHEN cnt>1 THEN 1.0 ELSE 0.0 END) AS r
       FROM c WHERE cnt > 0"""
)[0]["r"] or 0, 4)

data["active_customers"] = q(
    """WITH c AS (
         SELECT c.customer_unique_id, COUNT(o.order_id) AS cnt
         FROM olist_customers_dataset c LEFT JOIN olist_orders_dataset o
           ON c.customer_id=o.customer_id AND o.order_status='delivered'
         GROUP BY c.customer_unique_id)
       SELECT COUNT(*) AS n FROM c WHERE cnt > 0"""
)[0]["n"]

# 订单状态分布
data["order_status"] = q(
    "SELECT order_status AS name, COUNT(*) AS value FROM olist_orders_dataset GROUP BY order_status ORDER BY value DESC"
)

# ---------- 2. 月度趋势（已送达订单 + 销售额 + 客单价） ----------
data["monthly"] = q(
    """SELECT strftime('%Y-%m', o.order_purchase_timestamp) AS month,
              COUNT(DISTINCT o.order_id) AS orders,
              ROUND(SUM(i.price), 2) AS sales
       FROM olist_orders_dataset o
       LEFT JOIN olist_order_items_dataset i ON o.order_id=i.order_id
       WHERE o.order_status='delivered'
       GROUP BY month ORDER BY month"""
)
# 计算环比
for idx, r in enumerate(data["monthly"]):
    prev = data["monthly"][idx - 1] if idx > 0 else None
    r["orders_mom"] = round((r["orders"] - prev["orders"]) / prev["orders"] * 100, 1) if prev and prev["orders"] else None
    r["sales_mom"] = round((r["sales"] - prev["sales"]) / prev["sales"] * 100, 1) if prev and prev["sales"] else None

# ---------- 3. 月度延迟率 ----------
data["monthly_delay"] = q(
    """SELECT strftime('%Y-%m', order_purchase_timestamp) AS month,
              ROUND(100*AVG(CASE WHEN order_delivered_customer_date > order_estimated_delivery_date THEN 1.0 ELSE 0.0 END), 2) AS delay_rate
       FROM olist_orders_dataset
       WHERE order_status='delivered' AND order_delivered_customer_date IS NOT NULL
         AND order_estimated_delivery_date IS NOT NULL
       GROUP BY month ORDER BY month"""
)

# ---------- 4. 品类结构 ----------
data["category_sales"] = q(
    """SELECT COALESCE(n.product_category_name_english, p.product_category_name, 'unknown') AS category,
              ROUND(SUM(i.price), 2) AS sales,
              COUNT(i.order_id) AS items,
              ROUND(SUM(i.price)/NULLIF(COUNT(i.order_id),0), 2) AS avg_price
       FROM olist_order_items_dataset i
       LEFT JOIN olist_products_dataset p ON i.product_id=p.product_id
       LEFT JOIN product_category_name_translation n ON n.product_category_name=p.product_category_name
       GROUP BY category ORDER BY sales DESC"""
)
total_cat_sales = sum(r["sales"] for r in data["category_sales"])
for r in data["category_sales"]:
    r["sales_pct"] = round(r["sales"] / total_cat_sales * 100, 2)

# ---------- 5. 各州延迟率 ----------
data["state_delay"] = q(
    """SELECT c.customer_state AS state,
              ROUND(100*AVG(CASE WHEN o.order_delivered_customer_date > o.order_estimated_delivery_date THEN 1.0 ELSE 0.0 END), 2) AS delay_rate,
              COUNT(DISTINCT o.order_id) AS orders
       FROM olist_orders_dataset o
       LEFT JOIN olist_customers_dataset c ON o.customer_id=c.customer_id
       WHERE o.order_status='delivered' AND o.order_delivered_customer_date IS NOT NULL
         AND o.order_estimated_delivery_date IS NOT NULL AND c.customer_state IS NOT NULL
       GROUP BY state ORDER BY delay_rate DESC"""
)

# ---------- 6. 评分分布 ----------
data["score_dist"] = q(
    """SELECT review_score AS score, COUNT(*) AS count
       FROM olist_order_reviews_dataset GROUP BY review_score ORDER BY review_score"""
)

# ---------- 7. 低分品类 ----------
data["low_score_category"] = q(
    """SELECT COALESCE(n.product_category_name_english, p.product_category_name) AS category,
              COUNT(i.order_id) AS items,
              ROUND(100*AVG(CASE WHEN r.review_score BETWEEN 1 AND 2 THEN 1.0 ELSE 0.0 END), 2) AS low_score_rate
       FROM olist_order_items_dataset i
       LEFT JOIN olist_products_dataset p ON i.product_id=p.product_id
       LEFT JOIN product_category_name_translation n ON n.product_category_name=p.product_category_name
       LEFT JOIN olist_order_reviews_dataset r ON i.order_id=r.order_id
       WHERE p.product_category_name IS NOT NULL AND r.review_score IS NOT NULL
       GROUP BY category HAVING items >= 30 ORDER BY low_score_rate DESC"""
)

# ---------- 8. 配送时长 vs 评分 ----------
data["delivery_vs_score"] = q(
    """SELECT CASE WHEN r.review_score BETWEEN 1 AND 2 THEN '低分(1-2)'
                   WHEN r.review_score BETWEEN 4 AND 5 THEN '高分(4-5)' END AS grp,
              COUNT(DISTINCT o.order_id) AS orders,
              ROUND(AVG(julianday(o.order_delivered_customer_date)-julianday(o.order_purchase_timestamp)), 2) AS avg_days
       FROM olist_orders_dataset o
       LEFT JOIN olist_order_reviews_dataset r ON o.order_id=r.order_id
       WHERE o.order_status='delivered' AND o.order_delivered_customer_date IS NOT NULL
         AND r.review_score IN (1,2,4,5)
       GROUP BY grp"""
)

data["delay_vs_score"] = q(
    """SELECT CASE WHEN o.order_delivered_customer_date > o.order_estimated_delivery_date THEN '延迟送达'
                   ELSE '准时送达' END AS grp,
              ROUND(AVG(r.review_score), 2) AS avg_score,
              COUNT(DISTINCT o.order_id) AS orders
       FROM olist_orders_dataset o
       LEFT JOIN olist_order_reviews_dataset r ON o.order_id=r.order_id
       WHERE o.order_status='delivered' AND o.order_delivered_customer_date IS NOT NULL
         AND o.order_estimated_delivery_date IS NOT NULL AND r.review_score IS NOT NULL
       GROUP BY grp"""
)

# ---------- 9. 价格 / 运费分组评分 ----------
data["price_group_score"] = q(
    """WITH g AS (SELECT ntile(10) OVER (ORDER BY price) AS grp, order_id
                 FROM olist_order_items_dataset)
       SELECT g.grp, ROUND(AVG(r.review_score), 4) AS avg_score
       FROM g LEFT JOIN olist_order_reviews_dataset r ON g.order_id=r.order_id
       WHERE r.review_score IS NOT NULL GROUP BY g.grp ORDER BY g.grp"""
)
data["freight_group_score"] = q(
    """WITH g AS (SELECT ntile(10) OVER (ORDER BY freight_value) AS grp, order_id
                 FROM olist_order_items_dataset)
       SELECT g.grp, ROUND(AVG(r.review_score), 4) AS avg_score
       FROM g LEFT JOIN olist_order_reviews_dataset r ON g.order_id=r.order_id
       WHERE r.review_score IS NOT NULL GROUP BY g.grp ORDER BY g.grp"""
)

# ---------- 10. 购买频次分布 ----------
data["purchase_freq"] = q(
    """WITH c AS (
         SELECT c.customer_unique_id, COUNT(o.order_id) AS cnt
         FROM olist_customers_dataset c LEFT JOIN olist_orders_dataset o
           ON c.customer_id=o.customer_id AND o.order_status='delivered'
         GROUP BY c.customer_unique_id)
       SELECT cnt AS orders, COUNT(*) AS users FROM c GROUP BY cnt ORDER BY cnt"""
)

# ---------- 11. 首购 cohort ----------
data["new_customers_monthly"] = q(
    """WITH t AS (
         SELECT c.customer_unique_id, MIN(o.order_purchase_timestamp) AS first_date
         FROM olist_orders_dataset o LEFT JOIN olist_customers_dataset c
           ON o.customer_id=c.customer_id
         WHERE o.order_status='delivered'
         GROUP BY c.customer_unique_id)
       SELECT strftime('%Y-%m', first_date) AS month, COUNT(*) AS new_customers
       FROM t GROUP BY month ORDER BY month"""
)

# ---------- 12. 配送时长分布 ----------
data["delivery_days_dist"] = q(
    """SELECT ROUND(julianday(order_delivered_customer_date)-julianday(order_purchase_timestamp),0) AS days,
              COUNT(*) AS orders
       FROM olist_orders_dataset
       WHERE order_status='delivered' AND order_delivered_customer_date IS NOT NULL
         AND order_purchase_timestamp IS NOT NULL
       GROUP BY days ORDER BY days"""
)

# ---------- 13. 支付方式分布 ----------
data["payment_type"] = q(
    """SELECT payment_type AS name, ROUND(SUM(payment_value), 2) AS value, COUNT(*) AS count
       FROM olist_order_payments_dataset GROUP BY payment_type ORDER BY value DESC"""
)

conn.close()

# ---------- 14. 建模结果（来自报告，静态写入） ----------
data["model_comparison"] = [
    {"model": "逻辑回归 LR", "auc": 0.5889, "f1": 0.2987, "acc": 0.7699},
    {"model": "随机森林 RF", "auc": 0.6103, "f1": 0.2902, "acc": 0.7708},
    {"model": "梯度提升 GBDT", "auc": 0.6142, "f1": 0.3255, "acc": 0.7762},
    {"model": "神经网络 MLP", "auc": 0.5881, "f1": 0.3029, "acc": 0.7705},
]

data["review_label_dist"] = [
    {"name": "低分(1-2)", "value": 14449, "pct": 14.64},
    {"name": "中等(3)", "value": 8171, "pct": 8.28},
    {"name": "高分(4-5)", "value": 76053, "pct": 77.08},
]

data["delay_label_dist"] = [
    {"name": "按时/提前", "value": 88644, "pct": 91.89},
    {"name": "延迟", "value": 7826, "pct": 8.11},
]

data["shap_importance"] = [
    {"feature": "购买月份 purchase_month", "value": 0.030044},
    {"feature": "商品件数 item_count", "value": 0.021085},
    {"feature": "运费总额 total_freight", "value": 0.015591},
    {"feature": "顾客州 RJ", "value": 0.013253},
    {"feature": "品类 床品浴室 cama_mesa_banho", "value": 0.005543},
    {"feature": "品类 办公家具 moveis_escritorio", "value": 0.002844},
    {"feature": "平均商品价 avg_item_price", "value": 0.002476},
    {"feature": "顾客州 BA", "value": 0.001936},
    {"feature": "购买年份 purchase_year", "value": 0.001793},
    {"feature": "商品总价 total_price", "value": 0.001515},
]

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False)

OUT_JS.parent.mkdir(parents=True, exist_ok=True)
with open(OUT_JS, "w", encoding="utf-8") as f:
    f.write("window.OLIST_DATA = ")
    json.dump(data, f, ensure_ascii=False)
    f.write(";\n")

print(f"已写入 {OUT} 和 {OUT_JS}")
print(f"KPI: {data['kpi']}")
print(f"月度数据行数: {len(data['monthly'])}")
print(f"品类数: {len(data['category_sales'])}")
