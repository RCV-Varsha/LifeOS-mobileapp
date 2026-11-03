import { SafeAreaView } from 'react-native-safe-area-context';
import Button from '../components/ActionButton';
import { colors, surface, typography } from '../ui/theme';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
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
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <Text style={styles.eyebrow}>DIRECTION</Text>
      <Text style={styles.heading}>Your goals</Text>
      <Text style={styles.subtitle}>Make room for what matters. One meaningful step at a time.</Text>

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
            <Pressable accessibilityRole="button" accessibilityLabel={`View goal: ${item.goal}`} onPress={() => onOpenGoal(item.id,item.goal)} style={({pressed}) => [styles.card, pressed && {opacity:0.7}]}>
              <Text style={styles.title}>{item.goal}</Text>
              <Text style={styles.meta}>{item.minutesPerDay} minutes set aside each day</Text>
              <Text style={styles.cardAction}>View goal  ›</Text>
            </Pressable>
          )}
        />
      )}

      <Button
        title={error ? 'Try again' : 'Refresh'}
        disabled={isLoading}
        onPress={() => setReload((value) => value + 1)}
      />
      <Button variant="primary" title="Add goal" onPress={onAddGoal} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 28,
    backgroundColor: colors.paper,
  },
  eyebrow:{...typography.eyebrow,marginTop:16},
  heading: { fontSize: 30, lineHeight:37, fontWeight: '700', color:colors.ink, marginTop:8 },
  subtitle: { color: colors.muted, lineHeight:22, marginTop: 10, marginBottom: 28 },
  list: { flex: 1 },
  card: {
    ...surface,
    padding: 20,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  title: { fontSize: 19, fontWeight: '700', color:colors.ink, marginBottom: 8 },
  meta:{color:colors.muted},
  empty:{color:colors.muted,fontSize:16,lineHeight:24,marginTop:18},
  cardAction: { marginTop: 20, color: colors.ink, fontWeight: '600' },
  error: { color: colors.danger, marginBottom: 16 },
});
