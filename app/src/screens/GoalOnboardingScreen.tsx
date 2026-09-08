import { useState } from 'react';
import {
  Button,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import { saveGoal } from '../services/goalService';
type GoalOnboardingScreenProps = {
  onSaved: () => void;
  onCancel: () => void;
};

export default function GoalOnboardingScreen({
  onSaved,
  onCancel,
}: GoalOnboardingScreenProps) {
  const [goal, setGoal] = useState('');
  const [reason, setReason] = useState('');
  const [minutes, setMinutes] = useState('20');
  const [outcome, setOutcome] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [milestones, setMilestones] = useState('');
  const [error, setError] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  function reviewGoal() {
    const title = goal.trim();
    const why = reason.trim();
    const time = minutes.trim();
    const desired = outcome.trim();

    if (title.length < 3 || title.length > 120) {
      setError('Enter a goal between 3 and 120 characters.');
      return;
    }

    if (why.length > 500) {
      setError('Keep your reason to 500 characters or fewer.');
      return;
    }

    if (!/^\d+$/.test(time) || Number(time) < 5 || Number(time) > 240) {
      setError('Enter a whole number of minutes between 5 and 240.');
      return;
    }
    if (desired.length > 0 && (desired.length < 3 || desired.length > 200)) { setError('Desired outcome must be 3–200 characters.'); return; }
    if (targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) { setError('Target date must use YYYY-MM-DD.'); return; }
    if (!desired && milestones.trim()) { setError('Define a desired outcome before adding milestones.'); return; }

    setGoal(title);
    setReason(why);
    setMinutes(String(Number(time)));
    setOutcome(desired);
    setError('');
    setIsReviewing(true);
  }

  async function submitGoal() {
  if (isSaving || savedId) return;

  setIsSaving(true);
  setError('');

  try {
    const id = await saveGoal({
      goal,
      reason,
      minutesPerDay: Number(minutes),
      ...(outcome ? { desiredOutcome: { title: outcome, description: '', targetValue: null, targetUnit: null, targetDate: targetDate || null }, milestones: milestones.split('\n').map((item)=>item.trim()).filter(Boolean).slice(0,8).map((title)=>({ title, description:'', targetValue:null, targetUnit:null, targetDate:null })) } : {}),
    });

    setSavedId(id);
    onSaved();
  } catch {
    setError(
      'Save could not be confirmed. Check the backend before retrying; the goal may already have been saved.',
    );
  } finally {
    setIsSaving(false);
  }
}
  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <Text style={styles.heading}>
        {isReviewing ? 'Review your goal' : 'What do you want to work toward?'}
      </Text>

      {isReviewing ? (
        <>
          <Text style={styles.label}>Your goal</Text>
          <Text>{goal}</Text>
          <Text style={styles.label}>Why it matters</Text>
          <Text>{reason || 'Not provided'}</Text>
          <Text style={styles.label}>Daily time</Text>
          <Text>{minutes} minutes</Text>
          <Text style={styles.label}>Desired outcome</Text>
          <Text>{outcome || 'Not defined yet'}</Text>
          {targetDate ? <><Text style={styles.label}>Target date</Text><Text>{targetDate}</Text></> : null}
          {milestones.trim() ? <><Text style={styles.label}>Milestones</Text>{milestones.split('\n').filter((item)=>item.trim()).map((item,index)=><Text key={index}>{index+1}. {item.trim()}</Text>)}</> : null}
          {savedId ? (
  <>
    <Text style={styles.note} accessibilityLiveRegion="polite">
      Goal saved successfully.
    </Text>
    <Text selectable>Goal ID: {savedId}</Text>
  </>
) : (
  <>
    <Text style={styles.note}>
      Ready to save this goal?
    </Text>

    {error ? (
      <Text style={styles.error} accessibilityLiveRegion="polite">
        {error}
      </Text>
    ) : null}

    <Button
      title={isSaving ? 'Saving...' : 'Save goal'}
      onPress={submitGoal}
      disabled={isSaving}
    />

    <Button
      title="Edit goal"
      disabled={isSaving}
      onPress={() => {
        setError('');
        setIsReviewing(false);
      }}
    />
  </>
)}
        </>
      ) : (
        <>
          <Text style={styles.label}>Your goal</Text>
          <TextInput
            accessibilityLabel="Your goal"
            style={styles.input}
            value={goal}
            onChangeText={setGoal}
            placeholder="Learn conversational Spanish"
          />

          <Text style={styles.label}>Why it matters (optional)</Text>
          <TextInput
            accessibilityLabel="Why your goal matters, optional"
            style={[styles.input, styles.multiline]}
            value={reason}
            onChangeText={setReason}
            placeholder="I want to speak with family"
            multiline
          />

          <Text style={styles.label}>Minutes per day (5–240)</Text>
          <TextInput
            accessibilityLabel="Minutes per day, between 5 and 240"
            style={styles.input}
            value={minutes}
            onChangeText={setMinutes}
            keyboardType="number-pad"
          />

          <Text style={styles.label}>What would meaningful success look like? (optional)</Text>
          <TextInput accessibilityLabel="Desired outcome" style={[styles.input,styles.multiline]} value={outcome} onChangeText={setOutcome} placeholder="Build and deploy a small Python application" multiline maxLength={200}/>
          <Text style={styles.label}>Outcome target date (optional)</Text>
          <TextInput accessibilityLabel="Outcome target date" style={styles.input} value={targetDate} onChangeText={setTargetDate} placeholder="YYYY-MM-DD" maxLength={10}/>
          <Text style={styles.label}>Milestones (optional, one per line)</Text>
          <TextInput accessibilityLabel="Milestones, one per line" style={[styles.input,styles.multiline]} value={milestones} onChangeText={setMilestones} placeholder={'Learn fundamentals\nBuild the application\nDeploy it'} multiline/>

          {error ? (
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}

          <Text style={styles.note}>You can review this before saving.</Text>
          <Button title="Review goal" onPress={reviewGoal} />
        </>
      )}
      <Text style={styles.note}>
  Cancel discards this unsaved draft.
</Text>
<Button title="Cancel" onPress={onCancel} disabled={isSaving} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 64,
    paddingBottom: 48,
    backgroundColor: '#fff',
  },
  heading: { fontSize: 26, fontWeight: '700', marginBottom: 16 },
  label: { fontSize: 16, fontWeight: '600', marginTop: 20, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#777',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#111',
  },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  note: { color: '#555', marginVertical: 24 },
  error: { color: '#b00020', marginTop: 16 },
});
