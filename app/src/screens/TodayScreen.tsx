import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Button,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  completeTask,
  getTodayTasks,
  uncompleteTask,
  type LifeTask,
} from '../services/taskService';

type Props = {
  onManageGoals: () => void;
};

function calculateProgress(tasks: LifeTask[]) {
  const completed = tasks.filter((task) => task.status === 'completed').length;
  const total = tasks.length;
  return {
    completed,
    total,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}

export default function TodayScreen({ onManageGoals }: Props) {
  const [tasks, setTasks] = useState<LifeTask[]>([]);
  const [date, setDate] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    async function load() {
      setIsLoading(true);
      setError('');

      try {
        const today = await getTodayTasks(controller.signal);
        if (active) {
          setTasks(today.tasks);
          setDate(today.date);
        }
      } catch {
        if (active) setError("Could not load today's tasks.");
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

  const progress = calculateProgress(tasks);
  const goalGroups = useMemo(() => {
    const groups = new Map<string, { title: string; tasks: LifeTask[] }>();

    for (const task of tasks) {
      const group = groups.get(task.goalId);
      if (group) group.tasks.push(task);
      else groups.set(task.goalId, { title: task.goalTitle, tasks: [task] });
    }

    return [...groups.entries()];
  }, [tasks]);

  async function toggleTask(task: LifeTask) {
    if (updatingTaskId) return;

    setUpdatingTaskId(task.id);
    setError('');

    try {
      const updated =
        task.status === 'pending'
          ? await completeTask(task.id)
          : await uncompleteTask(task.id);

      setTasks((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch {
      setError('The task update was not saved. Please try again.');
    } finally {
      setUpdatingTaskId(null);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.eyebrow}>TODAY</Text>
      <Text style={styles.heading}>Your daily plan</Text>
      {date ? <Text style={styles.date}>{date}</Text> : null}

      {isLoading ? (
        <ActivityIndicator style={styles.loading} size="large" />
      ) : error && tasks.length === 0 ? (
        <View style={styles.messageBlock}>
          <Text style={styles.error}>{error}</Text>
          <Button title="Try again" onPress={() => setReload((value) => value + 1)} />
        </View>
      ) : tasks.length === 0 ? (
        <View style={styles.messageBlock}>
          <Text style={styles.emptyTitle}>Nothing scheduled for today</Text>
          <Text style={styles.muted}>
            Accept a goal plan to turn its actions into daily tasks.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Progress</Text>
            <Text style={styles.progressCount}>
              {progress.completed} / {progress.total} completed
            </Text>
            <Text style={styles.percent}>{progress.percent}%</Text>
            <Text style={styles.muted}>
              {progress.total - progress.completed === 0
                ? 'Everything planned for today is complete.'
                : `${progress.total - progress.completed} task${progress.total - progress.completed === 1 ? '' : 's'} need attention.`}
            </Text>
          </View>

          {goalGroups.map(([goalId, group]) => (
            <View key={goalId} style={styles.goalSection}>
              <Text style={styles.goalTitle}>{group.title}</Text>

              {group.tasks.map((task) => {
                const completed = task.status === 'completed';
                const updating = updatingTaskId === task.id;

                return (
                  <Pressable
                    key={task.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: completed, disabled: Boolean(updatingTaskId) }}
                    disabled={Boolean(updatingTaskId)}
                    onPress={() => void toggleTask(task)}
                    style={({ pressed }) => [
                      styles.task,
                      completed && styles.completedTask,
                      pressed && styles.pressedTask,
                    ]}
                  >
                    <Text style={styles.checkbox}>{completed ? '☑' : '☐'}</Text>
                    <View style={styles.taskText}>
                      <Text style={[styles.instruction, completed && styles.completedText]}>
                        {task.instruction}
                      </Text>
                      <Text style={styles.minutes}>
                        {task.plannedMinutes} min{updating ? ' · Saving…' : ''}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </>
      )}

      {error && tasks.length > 0 ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.actions}>
        <Button title="Refresh" onPress={() => setReload((value) => value + 1)} disabled={isLoading} />
        <Button title="Manage goals" onPress={onManageGoals} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 48,
    backgroundColor: '#fff',
  },
  eyebrow: { color: '#1976b8', fontWeight: '800', letterSpacing: 1.4 },
  heading: { fontSize: 28, fontWeight: '700', marginTop: 6 },
  date: { color: '#666', marginTop: 6 },
  loading: { marginTop: 48 },
  messageBlock: { gap: 14, marginVertical: 40 },
  emptyTitle: { fontSize: 19, fontWeight: '600' },
  muted: { color: '#666', lineHeight: 21 },
  error: { color: '#b00020', marginTop: 18 },
  summaryCard: {
    padding: 18,
    marginTop: 24,
    marginBottom: 12,
    borderRadius: 10,
    backgroundColor: '#eef7fc',
  },
  summaryLabel: { fontWeight: '700', color: '#24566f' },
  progressCount: { fontSize: 20, fontWeight: '700', marginTop: 8 },
  percent: { fontSize: 34, fontWeight: '800', color: '#1976b8', marginVertical: 6 },
  goalSection: { marginTop: 22 },
  goalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 10 },
  task: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 9,
  },
  completedTask: { backgroundColor: '#f4faf6', borderColor: '#b8d8c2' },
  pressedTask: { opacity: 0.65 },
  checkbox: { fontSize: 25, marginRight: 12, color: '#1976b8' },
  taskText: { flex: 1 },
  instruction: { fontSize: 16, lineHeight: 22 },
  completedText: { textDecorationLine: 'line-through', color: '#66736a' },
  minutes: { color: '#666', marginTop: 6 },
  actions: { gap: 10, marginTop: 30 },
});
