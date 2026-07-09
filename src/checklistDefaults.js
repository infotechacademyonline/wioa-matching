// Creates one checklist_items row per active checklist_template step for a
// participant, if they don't already have that step. Safe to call repeatedly
// (e.g. after you add a new step to the template later) — existing rows are
// left untouched.

async function seedChecklistForParticipant(pool, participantId) {
  await pool.query(
    `INSERT INTO checklist_items (participant_id, step_key)
     SELECT $1, step_key FROM checklist_template WHERE active = TRUE
     ON CONFLICT (participant_id, step_key) DO NOTHING`,
    [participantId]
  );
}

module.exports = { seedChecklistForParticipant };
