import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';

interface Appointment {
  id: number;
  omschrijving: string;
  start: string;
  einde: string;
  vak: { code: string };
}

const ScheduleScreen: React.FC = () => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const router = useRouter();

  useEffect(() => {
    fetchSchedule();
  }, []);

  const fetchSchedule = async () => {
    const token = await SecureStore.getItemAsync('access_token');
    if (!token) {
      router.replace('/');
      return;
    }

    try {
      // Get account info
      const accountResponse = await fetch('https://ozhw.magister.net/api/account', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-XSRF-TOKEN': token,
          'Content-Type': 'application/json',
        },
      });
      const accountData = await accountResponse.json();
      const persoonId = accountData.Persoon.Id;

      const today = new Date().toISOString().split('T')[0];
      const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const response = await fetch(`https://ozhw.magister.net/api/personen/${persoonId}/afspraken?van=${today}&tot=${nextWeek}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-XSRF-TOKEN': token,
          'Content-Type': 'application/json',
        },
      });
      const data = await response.json();
      setAppointments(data.items || []);
    } catch (error) {
      console.error(error);
    }
  };

  const renderAppointment = ({ item }: { item: Appointment }) => (
    <View style={styles.appointment}>
      <Text style={styles.vak}>{item.vak.code}</Text>
      <Text style={styles.omschrijving}>{item.omschrijving}</Text>
      <Text style={styles.time}>{new Date(item.start).toLocaleString()}</Text>
    </View>
  );

  return (
    <LinearGradient
      colors={['#008000', '#ADD8E6']}
      style={styles.container}
    >
      <Text style={styles.title}>Rooster</Text>
      <FlatList
        data={appointments}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderAppointment}
        style={styles.list}
      />
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
    marginTop: 50,
    marginBottom: 20,
  },
  list: {
    flex: 1,
    paddingHorizontal: 20,
  },
  appointment: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: 15,
    marginBottom: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'white',
  },
  vak: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
  omschrijving: {
    fontSize: 16,
    color: 'white',
  },
  time: {
    fontSize: 14,
    color: 'lightgray',
  },
});

export default ScheduleScreen;