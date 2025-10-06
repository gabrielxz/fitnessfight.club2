# Investigation Findings - October 6, 2025

## Summary
Two related but distinct issues were identified affecting the habit tracking and badge system:
1. **Missing Habit Points**: Brian (and potentially others) missing 0.5 points from completed habits
2. **Rock Solid Badge Not Awarded**: 6 qualified users did not receive the Rock Solid badge

## Issue 1: Missing Habit Points (0.5 points)

### Symptoms
- Brian Clonaris completed all 5 habits last week (100% each)
- Expected: 2.5 habit points (5 × 0.5)
- Actual: 2.0 habit points
- Missing: 0.5 points

### Root Cause
**Asynchronous background processing failure without retry mechanism**

Location: `/app/api/habits/[id]/entries/route.ts` lines 144-154

```typescript
if (status === 'SUCCESS') {
  processHabitCompletion(...)
    .catch(error => {
      console.error('[Habit Points] Background processing failed:', error)
    })
}
```

The API returns immediately to the user, then processes points in the background. If `processHabitCompletion` fails (network timeout, database error, race condition), the error is logged but **never retried**.

### Evidence
- All 5 habits reached their targets:
  1. Meditate 15 minutes: 6/6 ✅ (completed Oct 4)
  2. No coffee after 4pm: 6/6 ✅ (completed Oct 5)
  3. Read for 15 mins: 5/5 ✅ (completed Oct 3)
  4. Sleep 7 hours: 5/4 ✅ (completed Oct 3)
  5. Quality Time: 3/3 ✅ (completed Oct 4)

- Brian has exactly 2.0 points (4 successful awards) instead of 2.5 (5 awards)
- All habits are in positions 0-4 (eligible for points)
- Simulation of the point-awarding logic shows all habits SHOULD have awarded points

### Contributing Factors
1. **NULL timezone**: Brian's timezone is NULL, causing the system to default to UTC. This could cause week boundary miscalculations.
2. **Rapid entry creation**: Some entries were created <1 second apart (948ms), potentially causing race conditions where multiple `processHabitCompletion` calls overlap.
3. **No retry logic**: A single transient failure results in permanent point loss.
4. **No reconciliation**: There's no weekly job to verify all completed habits awarded their points.

## Issue 2: Rock Solid Badge Not Awarded

### Symptoms
- 6 users qualified for Rock Solid Bronze badge (100% habit completion, ≥5 habits):
  1. Brian Clonaris (5/5 habits)
  2. Gabriel Beal (5/5 habits)
  3. Rocio Clonaris (5/5 habits)
  4. Paul Miranda (1/1 habits - doesn't meet min_habits=5 requirement)
  5. 2 others with null names (5/5 habits each)
- **NONE** were awarded the badge
- Cron job ran successfully at 2025-10-06T10:00:36 UTC
- Division changes and weekly badge resets worked correctly

### Root Cause
**Invalid PostgREST JSON query syntax in BadgeCalculator**

Location: `/lib/badges/BadgeCalculator.ts` line 77

```typescript
// WRONG - causes "invalid input syntax for type json" error
.eq('criteria->type', 'habit_weeks')

// CORRECT - should be:
.filter('criteria->>type', 'eq', 'habit_weeks')
// or
.contains('criteria', { type: 'habit_weeks' })
```

### How the Bug Works
1. Cron job runs weekly-division-shuffle at 10:00 UTC every Monday
2. Calls `badgeCalculator.evaluateHabitBadgesForWeek()` for each user with habits
3. The function tries to fetch habit badges with `.eq('criteria->type', 'habit_weeks')`
4. Query fails with "invalid input syntax for type json"
5. `badges` array is empty (0 results)
6. Function returns early without processing any users
7. No Rock Solid badges are awarded, no badge_progress entries created

### Evidence
- Cron job logs show successful execution at 10:00:36 UTC
- Division history has 6 entries for week 2025-09-29
- Weekly badges were reset at 10:00:36 UTC
- **Zero** badge_progress entries exist for Rock Solid badge
- Manual testing confirms:
  - `.eq('criteria->type', 'habit_weeks')` → 0 results, error
  - `.filter('criteria->>type', 'eq', 'habit_weeks')` → 1 result, success
  - All 6 users' habits show 100% completion when queried correctly

## Relationship Between Issues

Both issues stem from the same ecosystem but have **different failure modes**:

| Aspect | Habit Points Issue | Rock Solid Badge Issue |
|--------|-------------------|------------------------|
| **Type** | Individual async failures | Batch query failure |
| **Impact** | 1 out of 5 attempts failed for Brian | All 6 qualified users affected |
| **When** | During the week (real-time API calls) | Weekly cron job (batch processing) |
| **Cause** | Silent async failure, no retry | Invalid SQL syntax, silent error |
| **Detectability** | Hard to detect (looks like user mistake) | Easy to detect (everyone affected) |

## Fixes Required

### Immediate Fixes

1. **Fix Rock Solid Badge Query** (HIGH PRIORITY)
   - File: `/lib/badges/BadgeCalculator.ts` line 77
   - Change: `.eq('criteria->type', 'habit_weeks')` → `.filter('criteria->>type', 'eq', 'habit_weeks')`
   - Impact: Fixes badge awarding for future weeks

2. **Manually Award Missing Points and Badges**
   - Award Brian: +0.5 habit points
   - Award Rock Solid Bronze to 6 users (actually 5, Paul doesn't meet min_habits requirement)
   - Run SQL updates for cumulative_habit_points and user_badges

### Short-Term Fixes

3. **Add Retry Logic to Habit Points**
   - File: `/app/api/habits/[id]/entries/route.ts`
   - Add retry mechanism to `processHabitCompletion` (exponential backoff, 3 attempts)
   - Consider making it synchronous or using a job queue

4. **Ensure All Users Have Timezones**
   - Add database constraint: `timezone NOT NULL` with default 'America/New_York'
   - Backfill NULL timezones for existing users
   - Update signup/profile flows to capture timezone

5. **Add Error Logging and Monitoring**
   - Log all habit point awards to an audit table
   - Add Sentry/error tracking for background job failures
   - Add alerts for cron job failures

### Long-Term Improvements

6. **Weekly Reconciliation Job**
   - Create a cron job that verifies all 100% completed habits awarded their 0.5 points
   - Automatically fix discrepancies or alert admin

7. **Audit Trail Table**
   - Create `habit_point_awards` table to track every 0.5 point award
   - Include: user_id, habit_id, week_start, points_awarded, awarded_at
   - Use for debugging and reconciliation

8. **Improve Error Handling**
   - Don't silently catch errors in background jobs
   - Surface errors to admin dashboard
   - Add health check endpoint for cron jobs

9. **Testing**
   - Add integration tests for habit badge evaluation
   - Add tests for JSON query syntax
   - Add end-to-end tests for weekly cron job

## SQL Fixes to Run Now

```sql
-- Fix Brian's missing 0.5 points
UPDATE user_profiles
SET cumulative_habit_points = cumulative_habit_points + 0.5
WHERE id = '2fa01c2d-4ebc-45cd-b419-15e56fa1d10c';

-- Award Rock Solid Bronze to qualified users
-- (Need to get badge_id and user_ids first)

-- Check: Get Rock Solid badge ID
SELECT id FROM badges WHERE name = 'Rock Solid';

-- Check: Get all users who qualified (5+ habits, all at 100%)
-- (Run the check_rock_steady.js script to get the list)

-- Then insert into user_badges for each qualified user
```

## Prevention Checklist

- [ ] Fix BadgeCalculator query syntax
- [ ] Add retry logic to habit points
- [ ] Ensure all users have timezones
- [ ] Create audit trail table
- [ ] Add weekly reconciliation job
- [ ] Add error monitoring
- [ ] Add integration tests
- [ ] Document PostgREST JSON query syntax for team

---

**Investigation Date**: October 6, 2025, 10:49 AM EST
**Investigator**: Claude Code
**Status**: Root causes identified, fixes pending
