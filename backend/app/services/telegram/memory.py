import json

import redis.asyncio as redis

from app.core.config import settings

_redis = redis.from_url(settings.redis_url, decode_responses=True)

# A short rolling window, not a full transcript — enough for "and what
# about last week" or "how much did they pay" to resolve against the
# previous answer, without letting one long-running chat balloon the
# token count (and cost) of every future message forever. Same fail-open
# posture as rate_limit.py: memory is what makes follow-ups work, not
# what makes the bot function at all, so a Redis hiccup should degrade to
# "forgot the last few messages," never break the whole reply.
_MAX_TURNS = 12
_TTL_SECONDS = 6 * 3600


def _key(chat_id: str) -> str:
    return f"telegram:history:{chat_id}"


async def get_history(chat_id: str) -> list[dict]:
    try:
        raw = await _redis.lrange(_key(chat_id), 0, -1)
    except redis.RedisError:
        return []
    return [json.loads(item) for item in raw]


async def append_turns(chat_id: str, turns: list[dict]) -> None:
    if not turns:
        return
    key = _key(chat_id)
    try:
        async with _redis.pipeline(transaction=True) as pipe:
            for turn in turns:
                pipe.rpush(key, json.dumps(turn))
            pipe.ltrim(key, -_MAX_TURNS, -1)
            pipe.expire(key, _TTL_SECONDS)
            await pipe.execute()
    except redis.RedisError:
        pass
