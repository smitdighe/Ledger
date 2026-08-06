-- Ledger ClickHouse schema — trace/metric time-series.
-- MergeTree, daily partitions, 90-day TTL. Idempotent (IF NOT EXISTS).
-- Isolated in its own `ledger` database: the shared ClickHouse server also
-- hosts Langfuse's OTel tables (incl. its own `traces`) in `default`.

CREATE DATABASE IF NOT EXISTS ledger;

CREATE TABLE IF NOT EXISTS ledger.traces
(
    trace_id        String,
    span_id         String,
    parent_span_id  String,
    name            LowCardinality(String),
    start_time      DateTime64(3, 'UTC'),
    end_time        DateTime64(3, 'UTC'),
    duration_ms     Float64,
    status          LowCardinality(String),
    attributes      Map(String, String),
    event_date      Date MATERIALIZED toDate(start_time)
)
ENGINE = MergeTree
PARTITION BY event_date
ORDER BY (trace_id, start_time, span_id)
TTL event_date + INTERVAL 90 DAY
SETTINGS index_granularity = 8192;


CREATE TABLE IF NOT EXISTS ledger.metrics
(
    trace_id        String,
    metric_name     LowCardinality(String),
    metric_value    Float64,
    tier_used       LowCardinality(String),
    timestamp       DateTime64(3, 'UTC'),
    event_date      Date MATERIALIZED toDate(timestamp)
)
ENGINE = MergeTree
PARTITION BY event_date
ORDER BY (metric_name, timestamp, trace_id)
TTL event_date + INTERVAL 90 DAY
SETTINGS index_granularity = 8192;
