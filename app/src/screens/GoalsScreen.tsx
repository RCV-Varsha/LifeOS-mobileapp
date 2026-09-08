import { useEffect, useState } from 'react';
import { Button, FlatList, StyleSheet, Text, View } from 'react-native';
import { getGoals, type GoalSummary } from '../services/goalService';

type GoalsScreenProps = {
  onAddGoal: () => void;
  onOpenGoal: (goalId: string, goalTitle: string) => void;
  onToday: () => void;
};

export default function GoalsScreen({ onAddGoal, onOpenGoal, onToday }: GoalsScreenProps) {
  const [goals, setGoals] = useState<GoalSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    setIsLoading(true);
    setError('');

    async function load() {
      try {
        const items = await getGoals(controller.signal);
        if (active) setGoals(items);
      } catch {
        if (active) setError('Could not load goals. Check your connection.');
      } finally {
        clearTimeout(timeout);
        if (active) setIsLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [reload]);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Your goals</Text>
      <Text style={styles.subtitle}>Your 50 most recent goals</Text>

      {isLoading ? (
        <Text accessibilityLiveRegion="polite">Loading goals...</Text>
      ) : error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : (
        <FlatList
          style={styles.list}
          data={goals}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<Text>No goals yet. Create your first goal.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.title}>{item.goal}</Text>
              <Text>{item.minutesPerDay} minutes per day</Text>
              <View style={styles.cardAction}>
                <Button title="View goal" onPress={() => onOpenGoal(item.id,item.goal)} />
              </View>
            </View>
          )}
        />
      )}

      <Button
        title={error ? 'Try again' : 'Refresh'}
        disabled={isLoading}
        onPress={() => setReload((value) => value + 1)}
      />
      <Button title="Add goal" onPress={onAddGoal} />
      <Button title="Today's tasks" onPress={onToday} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 64,
    paddingBottom: 48,
    backgroundColor: '#fff',
  },
  heading: { fontSize: 26, fontWeight: '700' },
  subtitle: { color: '#555', marginTop: 8, marginBottom: 24 },
  list: { flex: 1 },
  card: {
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
  },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  cardAction: { marginTop: 12, alignItems: 'flex-start' },
  error: { color: '#b00020', marginBottom: 16 },
});
