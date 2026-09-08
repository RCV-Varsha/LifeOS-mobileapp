import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import GoalsScreen from './src/screens/GoalsScreen';
import GoalOnboardingScreen from './src/screens/GoalOnboardingScreen';
import GoalPlanScreen from './src/screens/GoalPlanScreen';
import TodayScreen from './src/screens/TodayScreen';
export default function App() {
  const [screen, setScreen] = useState<'today' | 'goals' | 'addGoal' | 'goalPlan'>('today');
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);

  function openGoalPlan(goalId: string) {
    setSelectedGoalId(goalId);
    setScreen('goalPlan');
  }

  return (
    <>
      {screen === 'today' ? (
        <TodayScreen onManageGoals={() => setScreen('goals')} />
      ) : screen === 'goals' ? (
        <GoalsScreen
          onAddGoal={() => setScreen('addGoal')}
          onOpenGoal={openGoalPlan}
          onToday={() => setScreen('today')}
        />
      ) : screen === 'addGoal' ? (
        <GoalOnboardingScreen
          onSaved={() => setScreen('goals')}
          onCancel={() => setScreen('goals')}
        />
      ) : selectedGoalId ? (
        <GoalPlanScreen
          goalId={selectedGoalId}
          onBack={() => setScreen('goals')}
          onToday={() => setScreen('today')}
        />
      ) : null}
      <StatusBar style="auto" />
    </>
  );
}
