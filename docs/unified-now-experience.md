# Unified NOW experience

NOW is LifeOS's primary entry point. It answers “What deserves my attention?” from the authenticated user's existing goals, outcomes, current tasks, execution state, daily capacity, adaptive proposal, planning preference, and date-valid planning memory.

The backend exposes one read-only `/now?timeZone=...` projection. Its rules are deterministic: a ready adaptive proposal takes precedence; a completed day suggests review; a fitting saved plan identifies its highest-ranked unfinished task; a capacity conflict asks for re-evaluation; one unambiguous task can be suggested without saved capacity; competing tasks without capacity or priority produce uncertainty instead of a forced answer; and an empty account points toward setting direction.

Recommendations are labeled as inferred from authorized stored state. Capacity is identified as user-provided or unknown. Adaptive acceptance and rejection remain explicit and unchanged. The mobile NOW card shows one recommendation and its reason; the full task and adaptive controls stay reachable behind a detail action, with existing Goals/Outcomes under DIRECTION and Preferences/Memory under YOU.

V10 does not add a general AI agent, new Groq context, scores, feeds, autonomous changes, new persistence, full DIRECTION/ YOU redesigns, or conversation.
