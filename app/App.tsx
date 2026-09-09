import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import GoalsScreen from './src/screens/GoalsScreen';
import GoalOnboardingScreen from './src/screens/GoalOnboardingScreen';
import GoalPlanScreen from './src/screens/GoalPlanScreen';
import TodayScreen from './src/screens/TodayScreen';
import DailyReviewScreen from './src/screens/DailyReviewScreen';
import { getCurrentSession, type CurrentSession } from './src/services/sessionService';
import PreferencesScreen from './src/screens/PreferencesScreen';
import MemoryScreen from './src/screens/MemoryScreen';
import YouScreen from './src/screens/YouScreen';
import PrimaryNavigation, { type PrimaryDestination } from './src/components/PrimaryNavigation';
import { colors } from './src/ui/theme';
export default function App() {
  const [session, setSession] = useState<CurrentSession | null>(null);
  const [sessionError, setSessionError] = useState(false);
  const [screen, setScreen] = useState<'today' | 'goals' | 'you' | 'addGoal' | 'goalPlan' | 'dailyReview' | 'preferences' | 'memory'>('today');
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [selectedGoalTitle, setSelectedGoalTitle] = useState('');
  const [reviewDate, setReviewDate] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    getCurrentSession(controller.signal).then(setSession).catch((error) => {
      if (error instanceof Error && error.name !== 'AbortError') setSessionError(true);
    });
    return () => controller.abort();
  }, []);

  if (!session) {
    return <View style={styles.session}><ActivityIndicator /><Text>{sessionError ? 'LifeOS could not establish the development identity.' : 'Starting LifeOS…'}</Text><StatusBar style="auto" /></View>;
  }

  function openGoalPlan(goalId: string, goalTitle: string) {
    setSelectedGoalId(goalId);
    setSelectedGoalTitle(goalTitle);
    setScreen('goalPlan');
  }

  const primary:PrimaryDestination|null=screen==='today'?'now':screen==='goals'?'direction':screen==='you'?'you':null;
  function selectPrimary(destination:PrimaryDestination){setScreen(destination==='now'?'today':destination==='direction'?'goals':'you');}

  return (
    <View style={styles.app}>
      {screen === 'today' ? (
        <TodayScreen onManageGoals={() => setScreen('goals')} onDailyReview={(date) => { setReviewDate(date); setScreen('dailyReview'); }} />
      ) : screen === 'memory' ? (
        <MemoryScreen onBack={() => setScreen('you')} />
      ) : screen === 'preferences' ? (
        <PreferencesScreen onBack={() => setScreen('you')} />
      ) : screen === 'dailyReview' && reviewDate ? (
        <DailyReviewScreen date={reviewDate} onBack={() => setScreen('today')} onReplan={() => setScreen('today')} />
      ) : screen === 'goals' ? (
        <GoalsScreen
          onAddGoal={() => setScreen('addGoal')}
          onOpenGoal={openGoalPlan}
        />
      ) : screen === 'you' ? (
        <YouScreen onPreferences={() => setScreen('preferences')} onMemory={() => setScreen('memory')} />
      ) : screen === 'addGoal' ? (
        <GoalOnboardingScreen
          onSaved={() => setScreen('goals')}
          onCancel={() => setScreen('goals')}
        />
      ) : selectedGoalId ? (
        <GoalPlanScreen
          goalId={selectedGoalId}
          goalTitle={selectedGoalTitle}
          onBack={() => setScreen('goals')}
          onToday={() => setScreen('today')}
        />
      ) : null}
      {primary?<PrimaryNavigation active={primary} onSelect={selectPrimary}/>:null}
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: colors.paper },
  session: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, backgroundColor:colors.paper },
});
