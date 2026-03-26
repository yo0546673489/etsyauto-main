-- Redis token bucket rate limiter for Etsy per-shop limits
-- KEYS[1] = bucket key (e.g. "etsy:bucket:{shop_id}")
-- ARGV[1] = capacity (max tokens)
-- ARGV[2] = refill_per_sec (tokens added per second)
-- ARGV[3] = now_ms (current time in milliseconds)
-- ARGV[4] = tokens_requested

local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_per_sec = tonumber(ARGV[2])
local now_ms = tonumber(ARGV[3])
local tokens_requested = tonumber(ARGV[4])

-- Load existing bucket state
local data = redis.call('HMGET', key, 'tokens', 'last_refill_ms')
local tokens = tonumber(data[1])
local last_refill_ms = tonumber(data[2])

if tokens == nil then
  tokens = capacity
  last_refill_ms = now_ms
end

-- Refill based on elapsed time
if now_ms > last_refill_ms then
  local elapsed_ms = now_ms - last_refill_ms
  local elapsed_sec = elapsed_ms / 1000.0
  local refill = elapsed_sec * refill_per_sec
  tokens = math.min(capacity, tokens + refill)
  last_refill_ms = now_ms
end

-- If enough tokens, deduct and allow
if tokens >= tokens_requested then
  tokens = tokens - tokens_requested
  redis.call('HMSET', key, 'tokens', tokens, 'last_refill_ms', last_refill_ms)
  return {1, 0}
end

-- Not enough tokens: compute ms until next token
local deficit = tokens_requested - tokens
local seconds_until_next = deficit / refill_per_sec
local ms_until_next = math.floor(seconds_until_next * 1000)

redis.call('HMSET', key, 'tokens', tokens, 'last_refill_ms', last_refill_ms)

return {0, ms_until_next}

