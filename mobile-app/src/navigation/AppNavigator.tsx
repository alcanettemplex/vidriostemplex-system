import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from '../screens/LoginScreen';
import HomeScreen from '../screens/HomeScreen';
import ODPsScreen from '../screens/ODPsScreen';
import EvidenciasScreen from '../screens/EvidenciasScreen';
import InstalacionesScreen from '../screens/InstalacionesScreen';

const Stack = createNativeStackNavigator();

const AppNavigator = () => (
  <NavigationContainer>
    <Stack.Navigator initialRouteName="Login">
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="ODPs" component={ODPsScreen} />
      <Stack.Screen name="Evidencias" component={EvidenciasScreen} />
      <Stack.Screen name="Instalaciones" component={InstalacionesScreen} />
    </Stack.Navigator>
  </NavigationContainer>
);

export default AppNavigator;
