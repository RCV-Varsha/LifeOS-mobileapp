import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import GoalsScreen from './src/screens/GoalsScreen';
import GoalOnboardingScreen from './src/screens/GoalOnboardingScreen';
import GoalPlanScreen from './src/screens/GoalPlanScreen';
import TodayScreen from './src/screens/TodayScreen';
import DailyReviewScreen from './src/screens/DailyReviewScreen';
export default function App() {
  const [screen, setScreen] = useState<'today' | 'goals' | 'addGoal' | 'goalPlan' | 'dailyReview'>('today');
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [reviewDate, setReviewDate] = useState('');

  function openGoalPlan(goalId: string) {
    setSelectedGoalId(goalId);
    setScreen('goalPlan');
  }

  return (
    <>
      {screen === 'today' ? (
        <TodayScreen onManageGoals={() => setScreen('goals')} onDailyReview={(date) => { setReviewDate(date); setScreen('dailyReview'); }} />
      ) : screen === 'dailyReview' && reviewDate ? (
        <DailyReviewScreen date={reviewDate} onBack={() => setScreen('today')} />
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
