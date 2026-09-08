import { useEffect, useState } from 'react';
import { ActivityIndicator, Button, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DailyReviewRequestError, generateDailyReview, getDailyReview, type DailyReview, type ReviewMetrics } from '../services/dailyReviewService';

type Props = { date: string; onBack: () => void };

function Section({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{items.map((item, index) => <Text key={`${title}-${index}`} style={styles.item}>• {item}</Text>)}</View>;
}

export default function DailyReviewScreen({ date, onBack }: Props) {
  const [metrics, setMetrics] = useState<ReviewMetrics | null>(null);
  const [review, setReview] = useState<DailyReview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    setIsLoading(true); setError('');
    void getDailyReview(date, controller.signal).then((result) => {
      if (active) { setMetrics(result.metrics); setReview(result.review); }
    }).catch(() => { if (active) setError('Could not load the review. Check your connection.'); })
      .finally(() => { clearTimeout(timeout); if (active) setIsLoading(false); });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [date, reload]);

  async function generate() {
    if (isGenerating) return;
    setIsGenerating(true); setError('');
    try { const result = await generateDailyReview(date); setReview(result); setMetrics(result.metrics); }
    catch (requestError) {
      setError(requestError instanceof DailyReviewRequestError && requestError.code === 'ai_rate_limited'
        ? 'The AI request limit was reached. Please try again shortly.'
        : requestError instanceof DailyReviewRequestError ? requestError.message : 'Could not reach the backend.');
    } finally { setIsGenerating(false); }
  }

  return <ScrollView contentContainerStyle={styles.container}>
    <Button title="Back to today" onPress={onBack} disabled={isGenerating} />
    <Text style={styles.eyebrow}>DAILY REVIEW</Text><Text style={styles.heading}>Your insight</Text><Text style={styles.date}>{date}</Text>
    {isLoading ? <ActivityIndicator style={styles.loading} size="large" /> : error && !metrics ? <View style={styles.message}><Text style={styles.error}>{error}</Text><Button title="Try again" onPress={() => setReload((value) => value + 1)} /></View> : metrics ? <>
      <View style={styles.summary}><Text style={styles.percent}>{metrics.completionRate}%</Text><Text style={styles.count}>{metrics.completedTasks} completed · {metrics.incompleteTasks} incomplete</Text><Text style={styles.muted}>{metrics.goals.length} goal{metrics.goals.length === 1 ? '' : 's'} represented</Text></View>
      {metrics.totalTasks === 0 ? <View style={styles.message}><Text style={styles.sectionTitle}>No tasks to review</Text><Text style={styles.muted}>There was no scheduled execution data for this date.</Text></View> : review ? <>
        <Text style={styles.aiSummary}>{review.insight.summary}</Text>
        <Section title="Observations" items={review.insight.observations} /><Section title="Strengths" items={review.insight.strengths} /><Section title="Areas to improve" items={review.insight.areasToImprove} />
        <View style={styles.next}><Text style={styles.sectionTitle}>Recommended next action</Text><Text style={styles.item}>{review.insight.recommendedNextAction}</Text></View>
      </> : <View style={styles.message}><Text style={styles.sectionTitle}>Insight not generated yet</Text><Text style={styles.muted}>Generate a review when you are ready. It will use the execution snapshot shown above.</Text><Button title={isGenerating ? 'Generating…' : 'Generate AI insight'} onPress={() => void generate()} disabled={isGenerating} /></View>}
    </> : null}
    {error && metrics ? <Text style={styles.error}>{error}</Text> : null}
  </ScrollView>;
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 56, paddingBottom: 48, backgroundColor: '#fff' },
  eyebrow: { color: '#6b4ba1', fontWeight: '800', letterSpacing: 1.4, marginTop: 28 }, heading: { fontSize: 28, fontWeight: '700', marginTop: 6 }, date: { color: '#666', marginTop: 6 }, loading: { marginTop: 48 },
  summary: { padding: 18, marginTop: 24, borderRadius: 10, backgroundColor: '#f2edfa' }, percent: { fontSize: 36, fontWeight: '800', color: '#6b4ba1' }, count: { fontSize: 17, fontWeight: '700', marginTop: 5 }, muted: { color: '#666', lineHeight: 21, marginTop: 6 },
  aiSummary: { fontSize: 18, lineHeight: 26, marginTop: 26 }, section: { marginTop: 24 }, sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 }, item: { fontSize: 16, lineHeight: 23, marginBottom: 7 }, next: { marginTop: 26, padding: 17, borderRadius: 9, backgroundColor: '#eef7fc' }, message: { gap: 14, marginTop: 32 }, error: { color: '#b00020', marginTop: 18 },
});
