import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import GoalsScreen from './src/screens/GoalsScreen';
import GoalOnboardingScreen from './src/screens/GoalOnboardingScreen';
export default function App() {
  const [screen, setScreen] = useState<'goals' | 'addGoal'>('goals');
  return (
    <>
        {screen === 'goals' ? (
        <GoalsScreen onAddGoal={() => setScreen('addGoal')} />
      ) : (
        <GoalOnboardingScreen
          onSaved={() => setScreen('goals')}
          onCancel={() => setScreen('goals')}
        />
      )}
      <StatusBar style="auto" />
    </>
  );
}