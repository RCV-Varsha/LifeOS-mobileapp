import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Button,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  acceptGoalPlan,
  generateGoalPlan,
  getGoalPlan,
  GoalPlanRequestError,
  type GoalPlan,
} from '../services/goalPlanService';

type Props = {
  goalId: string;
  onBack: () => void;
};

export default function GoalPlanScreen({ goalId, onBack }: Props) {
  const [goalPlan, setGoalPlan] = useState<GoalPlan | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    async function loadPlan() {
      try {
        setIsLoading(true);
        setLoadFailed(false);
        setError('');
        const plan = await getGoalPlan(goalId, controller.signal);
        if (active) setGoalPlan(plan);
      } catch {
        if (active) {
          setLoadFailed(true);
          setError('Could not load this plan. Check the backend connection.');
        }
      } finally {
        clearTimeout(timeout);
        if (active) setIsLoading(false);
      }
    }

    void loadPlan();
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [goalId, reload]);

  async function generate() {
    if (isWorking) return;
    setIsWorking(true);
    setError('');
    try {
      setGoalPlan(await generateGoalPlan(goalId));
    } catch (requestError) {
      if (
        requestError instanceof GoalPlanRequestError &&
        requestError.code === 'ai_rate_limited'
      ) {
        const retryText = requestError.retryAfterSeconds
          ? ` Try again in about ${requestError.retryAfterSeconds} seconds.`
          : ' Please try again shortly.';
        setError(`The AI request limit was reached.${retryText}`);
      } else if (requestError instanceof GoalPlanRequestError) {
        setError(requestError.message);
      } else {
        setError('Could not reach the backend. Check your connection.');
      }
    } finally {
      setIsWorking(false);
    }
  }

  async function accept() {
    if (!goalPlan || isWorking) return;
    setIsWorking(true);
    setError('');
    try {
      const accepted = await acceptGoalPlan(goalId);
      setGoalPlan({
        ...goalPlan,
        status: accepted.status,
        acceptedAt: accepted.acceptedAt,
      });
    } catch {
      setError('Could not accept this plan. Please try again.');
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Button title="Back to goals" onPress={onBack} disabled={isWorking} />

      {isLoading ? (
        <ActivityIndicator style={styles.loading} size="large" />
      ) : loadFailed ? (
        <View style={styles.empty}>
          <Text style={styles.error}>{error}</Text>
          <Button
            title="Try again"
            onPress={() => setReload((value) => value + 1)}
          />
        </View>
      ) : goalPlan ? (
        <>
          <Text style={styles.heading}>{goalPlan.goalTitle}</Text>
          <Text style={styles.summary}>{goalPlan.plan.summary}</Text>
          <Text style={styles.status}>
            {goalPlan.status === 'accepted' ? 'Accepted plan' : 'Proposed plan'}
          </Text>

          {goalPlan.plan.days.map((day) => (
            <View key={day.day} style={styles.card}>
              <Text style={styles.day}>Day {day.day}: {day.title}</Text>
              {day.actions.map((action, index) => (
                <Text key={`${day.day}-${index}`} style={styles.action}>
                  • {action.instruction} ({action.minutes} min)
                </Text>
              ))}
            </View>
          ))}

          {goalPlan.status === 'proposed' ? (
            <Button
              title={isWorking ? 'Accepting...' : 'Accept plan'}
              onPress={accept}
              disabled={isWorking}
            />
          ) : null}
        </>
      ) : (
        <View style={styles.empty}>
          <Text>No plan has been generated for this goal.</Text>
          <Button
            title={isWorking ? 'Generating...' : 'Generate AI plan'}
            onPress={generate}
            disabled={isWorking}
          />
        </View>
      )}

      {error && !loadFailed ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 48,
    backgroundColor: '#fff',
  },
  loading: { marginTop: 48 },
  heading: { fontSize: 26, fontWeight: '700', marginTop: 24 },
  summary: { fontSize: 16, lineHeight: 23, marginTop: 12, color: '#333' },
  status: { fontWeight: '600', marginVertical: 20, color: '#246b45' },
  card: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  day: { fontSize: 17, fontWeight: '700', marginBottom: 10 },
  action: { lineHeight: 21, marginBottom: 8 },
  empty: { gap: 20, marginTop: 40 },
  error: { color: '#b00020', marginTop: 20 },
});
