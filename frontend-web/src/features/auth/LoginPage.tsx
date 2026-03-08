import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { loginStart, loginSuccess, loginFailure } from './authSlice';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Eye, EyeOff, Lock, User, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

const loginSchema = z.object({
  username: z.string().min(1, 'El usuario es obligatorio'),
  password: z.string().min(6, 'La contraseña es muy corta'),
});

type LoginForm = z.infer<typeof loginSchema>;

const LoginPage: React.FC = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [showVideo, setShowVideo] = useState(true);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema)
  });

  const onSubmit = async (data: LoginForm) => {
    dispatch(loginStart());
    try {
      const res = await axios.post(`${process.env.REACT_APP_API_URL || "http://localhost:3001"}/api/auth/login`, data);
      dispatch(loginSuccess(res.data));
      localStorage.setItem('token', res.data.token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;
      toast.success('¡Bienvenido a Templex!');
      navigate('/');
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Error de autenticación';
      dispatch(loginFailure(errorMsg));
      toast.error(errorMsg);
    }
  };

  if (showVideo) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
        <video
          src="/preloader.mp4"
          autoPlay
          muted
          playsInline
          onEnded={() => setShowVideo(false)}
          className="w-full h-full object-cover"
        />
        <button
          onClick={() => setShowVideo(false)}
          className="absolute bottom-10 px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-full backdrop-blur-sm transition z-50 text-sm font-medium border border-white/20"
        >
          Omitir Intro
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="glass-panel w-full max-w-md p-8 relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-emerald-400"></div>

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-emerald-600 mb-2">
            Vidrios Templex
          </h1>
          <p className="text-slate-500">Sistema Integral v1.0</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Usuario</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User className="h-5 w-5 text-slate-400" />
              </div>
              <input
                {...register('username')}
                type="text"
                className={`block w-full pl-10 pr-3 py-3 border ${errors.username ? 'border-red-400 focus:ring-red-400' : 'border-slate-200 focus:ring-blue-500'} rounded-lg focus:outline-none focus:ring-2 focus:border-transparent transition-all bg-white/50`}
                placeholder="Ingresa tu usuario"
                autoComplete="username"
              />
            </div>
            {errors.username && <p className="mt-1 text-sm text-red-500">{errors.username.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-slate-400" />
              </div>
              <input
                {...register('password')}
                type={showPassword ? 'text' : 'password'}
                className={`block w-full pl-10 pr-10 py-3 border ${errors.password ? 'border-red-400 focus:ring-red-400' : 'border-slate-200 focus:ring-blue-500'} rounded-lg focus:outline-none focus:ring-2 focus:border-transparent transition-all bg-white/50`}
                placeholder="••••••••"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            {errors.password && <p className="mt-1 text-sm text-red-500">{errors.password.message}</p>}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isSubmitting ? (
              <Loader2 className="animate-spin h-5 w-5" />
            ) : (
              'Iniciar Sesión'
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
};

export default LoginPage;
