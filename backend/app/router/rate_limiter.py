"""Redis-backed rate limiting for the router.

Two primitives, both atomic (Lua) and shared across processes so async API
handlers and (later) Celery workers see the same buckets:

  * token bucket  — per-minute burst/refill (RPM)
  * daily quota   — fixed-window counter that resets at UTC midnight (RPD),
                    e.g. Gemini's 1500 requests/day.

Both async (redis.asyncio) and sync wrappers are provided.
"""
from __future__ import annotations

import time
from datetime import datetime, timezone

import redis
import redis.asyncio as aioredis

from app.core.config import settings

# refill token bucket: KEYS[1]=bucket  ARGV=capacity, refill_per_sec, now, requested
_TOKEN_BUCKET_LUA = """
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])
local d = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(d[1])
local ts = tonumber(d[2])
if tokens == nil then tokens = capacity; ts = now end
local delta = now - ts
if delta < 0 then delta = 0 end
tokens = math.min(capacity, tokens + delta * refill)
local allowed = 0
if tokens >= requested then tokens = tokens - requested; allowed = 1 end
redis.call('HMSET', key, 'tokens', tokens, 'ts', now)
redis.call('PEXPIRE', key, math.ceil((capacity / refill) * 1000) + 2000)
return allowed
"""

# fixed-window daily counter: KEYS[1]=key  ARGV=limit, ttl_seconds
_DAILY_QUOTA_LUA = """
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local c = redis.call('INCR', key)
if c == 1 then redis.call('EXPIRE', key, ttl) end
if c > limit then return 0 else return 1 end
"""


def _seconds_to_utc_midnight() -> int:
    now = datetime.now(timezone.utc)
    tomorrow = now.date().toordinal() + 1
    midnight = datetime.fromordinal(tomorrow).replace(tzinfo=timezone.utc)
    return max(1, int((midnight - now).total_seconds()))


class RateLimiter:
    def __init__(self, redis_url: str | None = None) -> None:
        url = redis_url or settings.redis_url
        self._aio = aioredis.from_url(url, decode_responses=True)
        self._sync = redis.from_url(url, decode_responses=True)

    # --- keys --------------------------------------------------------------
    @staticmethod
    def _bucket_key(name: str) -> str:
        return f"ledger:ratelimit:bucket:{name}"

    @staticmethod
    def _daily_key(name: str) -> str:
        day = datetime.now(timezone.utc).strftime("%Y%m%d")
        return f"ledger:ratelimit:daily:{name}:{day}"

    # --- async -------------------------------------------------------------
    async def acquire(self, name: str, rpm: int, tokens: int = 1) -> bool:
        """Token-bucket check for per-minute rate. Capacity == rpm, refill rpm/60/s."""
        capacity = max(1, rpm)
        refill = capacity / 60.0
        res = await self._aio.eval(
            _TOKEN_BUCKET_LUA, 1, self._bucket_key(name),
            capacity, refill, time.time(), tokens,
        )
        return bool(int(res))

    async def acquire_daily(self, name: str, limit: int) -> bool:
        res = await self._aio.eval(
            _DAILY_QUOTA_LUA, 1, self._daily_key(name),
            limit, _seconds_to_utc_midnight(),
        )
        return bool(int(res))

    async def reset(self, name: str) -> None:
        await self._aio.delete(self._bucket_key(name), self._daily_key(name))

    # --- sync (for Celery / scripts) --------------------------------------
    def acquire_sync(self, name: str, rpm: int, tokens: int = 1) -> bool:
        capacity = max(1, rpm)
        refill = capacity / 60.0
        res = self._sync.eval(
            _TOKEN_BUCKET_LUA, 1, self._bucket_key(name),
            capacity, refill, time.time(), tokens,
        )
        return bool(int(res))

    def acquire_daily_sync(self, name: str, limit: int) -> bool:
        res = self._sync.eval(
            _DAILY_QUOTA_LUA, 1, self._daily_key(name),
            limit, _seconds_to_utc_midnight(),
        )
        return bool(int(res))


rate_limiter = RateLimiter()
