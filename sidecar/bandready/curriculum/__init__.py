"""Curriculum: band estimation, study-plan generation and the adaptive rules engine.

Spec: 10-curriculum-progress.md. Storage: 11-data-model.md §8.

    from bandready.curriculum import estimate, plan, adaptive

    estimates = estimate.recompute(session, profile_id)     # after every scored attempt
    document  = plan.generate_plan(session, profile_id)     # onboarding / regenerate
    callouts  = adaptive.evaluate(session, profile_id)      # rules fire + rewrite the plan
"""

from __future__ import annotations

from bandready.curriculum import adaptive, estimate, plan
from bandready.curriculum.estimate import (
    SELF_LEVEL_BAND,
    SKILLS,
    SkillEstimate,
    compute_estimates,
    current_estimates,
    recompute,
    round_ielts,
)
from bandready.curriculum.plan import (
    VARIANTS,
    active_plan,
    build_plan,
    generate_plan,
    todays_session,
    weekly_weights,
)

__all__ = [
    "SELF_LEVEL_BAND",
    "SKILLS",
    "VARIANTS",
    "SkillEstimate",
    "active_plan",
    "adaptive",
    "build_plan",
    "compute_estimates",
    "current_estimates",
    "estimate",
    "generate_plan",
    "plan",
    "recompute",
    "round_ielts",
    "todays_session",
    "weekly_weights",
]
