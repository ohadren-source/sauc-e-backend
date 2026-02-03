import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, Dimensions, Alert } from 'react-native';
import Purchases from 'react-native-purchases';

// ============================================================================
// BACKEND URL (Only this URL, no API keys in app!)
// ============================================================================

const BACKEND_URL = 'https://sauc-e-backend.herokuapp.com'; // Replace with your deployed URL
const REVENUECAT_PUBLIC_KEY = 'appl_gNFmOHvscXhhhoQWpgDvVPQeLZm'; // This is OK to hardcode (public)

const FREE_QUESTION_LIMIT = 3;

const CATSUP = () => {
  // ============================================================================
  // STATE
  // ============================================================================
  
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [questionCount, setQuestionCount] = useState(0);
  const [question, setQuestion] = useState('');
  const [topic, setTopic] = useState('Mathematics');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [customerId, setCustomerId] = useState(null);

  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  
  useEffect(() => {
    const initTimer = setTimeout(() => {
      initializePurchases();
    }, 500);
    
    return () => clearTimeout(initTimer);
  }, []);
  
  async function initializePurchases() {
    try {
      // RevenueCat setup (Purchases SDK, not API)
      await Purchases.configure({ 
        apiKey: REVENUECAT_PUBLIC_KEY // This is public, OK to include
      });
      
      await checkSubscriptionStatus();
      console.log('RevenueCat initialized');
    } catch (error) {
      console.error('RevenueCat init error:', error);
    }
  }
  
  async function checkSubscriptionStatus() {
    try {
      const customerInfo = await Purchases.getCustomerInfo();
      const customerId = customerInfo.originalAppUserId;
      
      setCustomerId(customerId);
      
      if (customerInfo.entitlements.active['premium']) {
        setIsSubscribed(true);
      } else {
        setIsSubscribed(false);
      }
    } catch (error) {
      console.error('Subscription check error:', error);
    }
  }

  // ============================================================================
  // ASK QUESTION (Calls backend, NOT Claude directly)
  // ============================================================================
  
  async function handleAskQuestion() {
    if (!question.trim()) {
      Alert.alert('Error', 'Please enter a question');
      return;
    }

    setLoading(true);
    
    try {
      // Call backend endpoint (no API key in app)
      const response = await fetch(`${BACKEND_URL}/api/catsup/ask-question`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerId: customerId || 'anonymous',
          question: question,
          topic: topic
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        
        if (response.status === 403) {
          // Subscription required
          Alert.alert('Limit Reached', 'Upgrade to Premium for unlimited questions', [
            { text: 'Upgrade', onPress: handleSubscribe },
            { text: 'Cancel', onPress: () => {} }
          ]);
          return;
        }
        
        throw new Error(errorData.error || 'Failed to get answer');
      }

      const data = await response.json();
      setAnswer(data.answer);
      setQuestionCount(questionCount + 1);
      setQuestion(''); // Clear input
      
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to process question');
    } finally {
      setLoading(false);
    }
  }

  // ============================================================================
  // SUBSCRIPTION MANAGEMENT
  // ============================================================================
  
  async function handleSubscribe() {
    try {
      const offerings = await Purchases.getOfferings();
      
      if (offerings.current && offerings.current.availablePackages.length > 0) {
        const package_ = offerings.current.availablePackages[0];
        
        try {
          const { customerInfo } = await Purchases.purchasePackage(package_);
          
          if (customerInfo.entitlements.active['premium']) {
            setIsSubscribed(true);
            Alert.alert('Success', 'You are now subscribed!');
          }
        } catch (e) {
          if (!e.userCancelled) {
            Alert.alert('Error', 'Failed to complete purchase');
          }
        }
      }
    } catch (error) {
      console.error('Subscription error:', error);
    }
  }

  // ============================================================================
  // RENDER
  // ============================================================================
  
  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>CATSUP</Text>
        <Text style={styles.subtitle}>Learn Through Questions</Text>
        <Text style={styles.philosophy}>Understanding = Questions / Ego</Text>
      </View>

      {!isSubscribed && (
        <TouchableOpacity style={styles.upgradeButton} onPress={handleSubscribe}>
          <Text style={styles.upgradeText}>
            Premium · {FREE_QUESTION_LIMIT - (questionCount % FREE_QUESTION_LIMIT)} free left
          </Text>
        </TouchableOpacity>
      )}

      <View style={styles.content}>
        <Text style={styles.sectionTitle}>Pick a Topic</Text>
        
        {['Mathematics', 'Philosophy', 'Learning'].map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.topicButton, topic === t && styles.topicButtonActive]}
            onPress={() => setTopic(t)}
          >
            <Text style={styles.topicText}>{t}</Text>
          </TouchableOpacity>
        ))}

        <Text style={styles.sectionTitle}>Your Question</Text>
        <TextInput
          style={styles.input}
          placeholder="What would you like to understand?"
          placeholderTextColor="#999"
          value={question}
          onChangeText={setQuestion}
          multiline
        />

        <TouchableOpacity
          style={[styles.askButton, loading && styles.askButtonDisabled]}
          onPress={handleAskQuestion}
          disabled={loading}
        >
          <Text style={styles.askButtonText}>
            {loading ? 'Thinking...' : 'Ask CATSUP'}
          </Text>
        </TouchableOpacity>

        {answer && (
          <View style={styles.answerBox}>
            <Text style={styles.answerTitle}>Answer</Text>
            <Text style={styles.answerText}>{answer}</Text>
          </View>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>Runs on CATSUP Sauce 🔥 🧅</Text>
          <Text style={styles.footerSmall}>CATSUP is for Learning</Text>
          <Text style={styles.footerSmall}>Sample: BBQE (Safety) • RELISH (Feelings)</Text>
        </View>
      </View>
    </ScrollView>
  );
};

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  header: {
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 20,
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#FF8C42',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#ccc',
    marginBottom: 4,
  },
  philosophy: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
  },
  upgradeButton: {
    backgroundColor: '#FF8C42',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
    alignSelf: 'center',
    marginVertical: 16,
  },
  upgradeText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: 'white',
    marginTop: 24,
    marginBottom: 12,
  },
  topicButton: {
    backgroundColor: '#333',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#FF8C42',
    marginBottom: 8,
  },
  topicButtonActive: {
    backgroundColor: '#FF8C42',
    borderLeftColor: '#fff',
  },
  topicText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
  input: {
    backgroundColor: '#333',
    color: 'white',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginVertical: 12,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  askButton: {
    backgroundColor: '#FF8C42',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginVertical: 16,
  },
  askButtonDisabled: {
    opacity: 0.6,
  },
  askButtonText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 16,
  },
  answerBox: {
    backgroundColor: '#333',
    borderRadius: 8,
    padding: 16,
    marginTop: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#FF8C42',
  },
  answerTitle: {
    color: '#FF8C42',
    fontWeight: '700',
    marginBottom: 8,
  },
  answerText: {
    color: '#ccc',
    lineHeight: 20,
  },
  footer: {
    alignItems: 'center',
    marginTop: 40,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  footerText: {
    color: '#FF8C42',
    fontWeight: '600',
    marginBottom: 4,
  },
  footerSmall: {
    color: '#999',
    fontSize: 12,
    marginTop: 2,
  },
});

export default CATSUP;
