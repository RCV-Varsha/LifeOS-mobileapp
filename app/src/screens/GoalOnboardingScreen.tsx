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
  const [error, setError] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  function reviewGoal() {
    const title = goal.trim();
    const why = reason.trim();
    const time = minutes.trim();

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

    setGoal(title);
    setReason(why);
    setMinutes(String(Number(time)));
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