import { useEffect, useState } from 'react';
import { Button, FlatList, StyleSheet, Text, View } from 'react-native';
import { getGoals, type GoalSummary } from '../services/goalService';

type GoalsScreenProps = {
  onAddGoal: () => void;
  onOpenGoal: (goalId: string, goalTitle: string) => void;
};

export default function GoalsScreen({ onAddGoal, onOpenGoal }: GoalsScreenProps) {
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
      <Text style={styles.eyebrow}>DIRECTION</Text>
      <Text style={styles.heading}>What you are moving toward</Text>
      <Text style={styles.subtitle}>Goals hold the direction. Outcomes and milestones show what progress means.</Text>

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
          ListEmptyComponent={<Text style={styles.empty}>No direction yet. Add a goal when something matters enough to pursue.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.title}>{item.goal}</Text>
              <Text style={styles.meta}>{item.minutesPerDay} minutes set aside each day</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 58,
    paddingBottom: 28,
    backgroundColor: '#f7f2e8',
  },
  eyebrow:{color:'#486553',fontWeight:'800',letterSpacing:1.5},
  heading: { fontSize: 30, lineHeight:37, fontWeight: '700', color:'#20251f', marginTop:8 },
  subtitle: { color: '#625d54', lineHeight:22, marginTop: 10, marginBottom: 28 },
  list: { flex: 1 },
  card: {
    padding: 16,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#d9d1c3',
  },
  title: { fontSize: 19, fontWeight: '700', color:'#20251f', marginBottom: 8 },
  meta:{color:'#625d54'},
  empty:{color:'#625d54',fontSize:16,lineHeight:24,marginTop:18},
  cardAction: { marginTop: 12, alignItems: 'flex-start' },
  error: { color: '#9b3d35', marginBottom: 16 },
});
