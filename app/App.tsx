import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import GoalsScreen from './src/screens/GoalsScreen';
import GoalOnboardingScreen from './src/screens/GoalOnboardingScreen';
import GoalPlanScreen from './src/screens/GoalPlanScreen';
export default function App() {
  const [screen, setScreen] = useState<'goals' | 'addGoal' | 'goalPlan'>('goals');
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);

  function openGoalPlan(goalId: string) {
    setSelectedGoalId(goalId);
    setScreen('goalPlan');
  }

  return (
    <>
      {screen === 'goals' ? (
        <GoalsScreen
          onAddGoal={() => setScreen('addGoal')}
          onOpenGoal={openGoalPlan}
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
        />
      ) : null}
      <StatusBar style="auto" />
    </>
  );
}
