import AppHeader from './src/components/AppHeader';
import { useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'react-native';
import GoalsScreen from './src/screens/GoalsScreen';
import GoalOnboardingScreen from './src/screens/GoalOnboardingScreen';
import GoalPlanScreen from './src/screens/GoalPlanScreen';
import TodayScreen from './src/screens/TodayScreen';
import DailyReviewScreen from './src/screens/DailyReviewScreen';
import { getCurrentSession, type CurrentSession } from './src/services/sessionService';
import PreferencesScreen from './src/screens/PreferencesScreen';
import MemoryScreen from './src/screens/MemoryScreen';
import YouScreen from './src/screens/ProfileScreen';
import PrimaryNavigation, { type PrimaryDestination } from './src/components/PrimaryNavigation';
import { colors } from './src/ui/theme';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import EntryGate from './src/entry/EntryGate';
import { BrandHeader } from './src/components/LifeOSLogo';
import ActionButton from './src/components/ActionButton';
import WorkspaceScreen, { type WorkspaceArea } from './src/screens/WorkspaceScreen';
import SignInScreen from './src/screens/SignInScreen';
import { onSessionCleared, readTokens, saveTokens } from './src/services/authStorage';
import { api } from './src/services/apiFetch';
import HomeScreen from './src/screens/HomeScreen';


function LifeOSApp() {
  const [session, setSession] = useState<CurrentSession | null>(null);
  const [sessionError, setSessionError] = useState(false);
  const [sessionAttempt, setSessionAttempt] = useState(0);
  const [screen, setScreen] = useState<'home' | 'today' | 'goals' | 'you' | 'addGoal' | 'goalPlan' | 'dailyReview' | 'preferences' | 'memory' | 'workspace'>('home');
  const [workspaceArea,setWorkspaceArea]=useState<WorkspaceArea>('workspace');
  const [needsSignIn,setNeedsSignIn]=useState(false);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [selectedGoalTitle, setSelectedGoalTitle] = useState('');
  const [reviewDate, setReviewDate] = useState('');

  useEffect(() => onSessionCleared(() => {
    setSession(null); setNeedsSignIn(true); setScreen('home');
    setSelectedGoalId(null); setSelectedGoalTitle(''); setSessionError(false);
  }), []);

  async function signOut() {
    const tokens = await readTokens();
    // Clear this device immediately, including when the server is unreachable.
    await saveTokens(null);
    if (tokens) void api('/auth/logout', 'POST', { refreshToken: tokens.refreshToken }).catch(() => {});
  }

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen === 'home') return false;
      setScreen(screen === 'memory' || screen === 'preferences' ? 'you'
        : screen === 'goalPlan' || screen === 'addGoal' ? 'goals' : 'home');
      return true;
    });
    return () => subscription.remove();
  }, [screen]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setSessionError(false);
    const timeout = setTimeout(() => controller.abort(), 10000);
    readTokens().then(async(tokens)=>{
      if(!tokens){if(active)setNeedsSignIn(true);return;}
      try {const value=await getCurrentSession(controller.signal);if(active){setSession(value);setNeedsSignIn(false);}}
      catch(error){
        if(!await readTokens()){if(active)setNeedsSignIn(true);return;}
        // A valid locally stored account can open its offline workspace when transport fails.
        if(error instanceof TypeError || (error instanceof Error && ['AbortError','TimeoutError'].includes(error.name))){if(active){setSession({user:tokens.user});setScreen('workspace');}return;}
        throw error;
      }
    }).catch(() => {
      if (active) setSessionError(true);
    }).finally(() => clearTimeout(timeout));
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [sessionAttempt]);

  if(needsSignIn&&!session)return <SignInScreen onSignedIn={()=>{setNeedsSignIn(false);setSessionAttempt(v=>v+1);}}/>;
  if (!session) {
    return <View style={styles.session}><BrandHeader />
      {!sessionError ? <ActivityIndicator color={colors.ink} /> : null}
      <Text style={{ color: colors.muted, fontSize: 16, lineHeight: 24, textAlign: 'center' }}>{sessionError ? 'We couldn’t connect to LifeOS. Check your connection and try again.' : 'Opening your day…'}</Text>
      {sessionError ? <ActionButton variant="primary" title="Try again" onPress={() => setSessionAttempt((value) => value + 1)} /> : null}
      {sessionError ? <ActionButton title="Sign in again" onPress={()=>{void saveTokens(null).then(()=>setNeedsSignIn(true));}}/> : null}
      <StatusBar barStyle="dark-content" /></View>;
  }

  function openGoalPlan(goalId: string, goalTitle: string) {
    setSelectedGoalId(goalId);
    setSelectedGoalTitle(goalTitle);
    setScreen('goalPlan');
  }

  const primary:PrimaryDestination=screen==='home'||screen==='today'?'now':screen==='workspace'&&['planner','knowledge','assistant'].includes(workspaceArea)?workspaceArea as PrimaryDestination:'workspace';
  function selectPrimary(destination:PrimaryDestination){if(destination==='now')setScreen('home');else {setWorkspaceArea(destination);setScreen('workspace');}}

  return (
    <View style={styles.app}>
      <AppHeader onNavigate={area=>{setWorkspaceArea(area);setScreen('workspace');}} onGoals={()=>setScreen('goals')} onProfile={()=>setScreen('you')} onSignOut={()=>{void signOut().catch(()=>setSessionError(true));}}/>
      {screen==='home'?<HomeScreen onProfile={()=>setScreen('you')} onDailyExecution={()=>setScreen('today')} onNavigate={area=>{setWorkspaceArea(area);setScreen('workspace');}}/>:screen==='workspace'?<WorkspaceScreen area={workspaceArea} onNavigate={setWorkspaceArea} onDeleted={()=>{setSession(null);setNeedsSignIn(true);}}/>:screen === 'today' ? (
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
      <PrimaryNavigation active={primary} onSelect={selectPrimary}/>
      <StatusBar barStyle="dark-content" />
    </View>
  );
}

export default function App() {
  return <SafeAreaProvider><EntryGate><LifeOSApp /></EntryGate></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: colors.paper },
  session: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, backgroundColor:colors.paper },
});

