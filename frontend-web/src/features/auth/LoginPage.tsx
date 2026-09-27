import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { loginStart, loginSuccess, loginFailure } from './authSlice';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  Eye, EyeOff, Lock, User, Loader2, ArrowRight, ShieldCheck,
  WindowFrame, GearSix, ChartLineUp, UsersThree, Handshake,
} from '../../components/ui/icons';
import { TemplexLogo } from '../../components/ui/TemplexLogo';
import BienvenidaDigital from './BienvenidaDigital';
import { motion } from 'framer-motion';

const loginSchema = z.object({
  username: z.string().min(1, 'El usuario es obligatorio'),
  password: z.string().min(6, 'La contraseña es muy corta'),
});

type LoginForm = z.infer<typeof loginSchema>;

/** Campos de 48 px: cómodos con el dedo en el celular. */
const CAMPO = 'block h-12 w-full rounded-xl border bg-white pl-11 pr-3 text-[15px] text-slate-900 placeholder:text-slate-400 shadow-sm transition focus:outline-none focus:ring-2 focus:border-transparent';
/** Letra manuscrita del sistema (sin descargar fuentes): Windows trae Segoe Script. */
const FIRMA = "'Segoe Script', 'Brush Script MT', 'Snell Roundhand', cursive";

const MODULOS = [
  { icono: WindowFrame, texto: 'Órdenes de producción' },
  { icono: GearSix, texto: 'Producción e instalaciones' },
  { icono: ChartLineUp, texto: 'Inventario y compras' },
  { icono: UsersThree, texto: 'Clientes y CRM' },
];
const SELLOS = [
  { icono: WindowFrame, texto: 'Ventanería en aluminio y vidrio' },
  { icono: ShieldCheck, texto: 'Calidad y seguridad' },
  { icono: GearSix, texto: 'Procesos optimizados' },
  { icono: Handshake, texto: 'Respaldo siempre' },
];

const LoginPage: React.FC = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  /** Bienvenida tras un login exitoso; al terminar (o saltarla) se entra al ERP. */
  const [bienvenida, setBienvenida] = useState<{ nombre: string; rol: string; completa: boolean } | null>(null);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema)
  });

  const onSubmit = async (data: LoginForm) => {
    dispatch(loginStart());
    try {
      const res = await axios.post(`${process.env.REACT_APP_API_URL || "http://localhost:3001"}/api/auth/login`, data);
      dispatch(loginSuccess(res.data));
      sessionStorage.setItem('token', res.data.token);
      sessionStorage.setItem('user', JSON.stringify(res.data.user));
      axios.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;
      const u = res.data.user ?? {};
      setBienvenida({
        nombre: u.nombre_completo || u.nombre || u.username || 'Usuario',
        rol: u.rol || '',
        // Siempre la completa (decisión del usuario, 2026-09-27: la corta no le gustó).
        completa: true,
      });
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Error de autenticación';
      dispatch(loginFailure(errorMsg));
      toast.error(errorMsg);
    }
  };

  // ─── Pantalla (rediseño 2026-09-27, diseño del usuario en design/iniciodesesion.png) ───
  // La foto (personaje + edificio) es `design/personaje.png` convertida a WebP; todo
  // lo que es texto se arma aquí para que se vea nítido y se acomode a cada pantalla:
  //   PC (lg+)     franja azul con el mensaje | foto | tarjeta; sellos en 2xl.
  //   Tablet (md)  foto de fondo con velo, mensaje arriba y tarjeta centrada.
  //   Celular      fondo difuminado, logo, cara del personaje sobre la tarjeta.
  // El video de introducción se retiró (decisión del usuario): la pantalla ya es de marca.
  return (
    <div className="relative min-h-[100dvh] w-full overflow-x-clip bg-[#0b2a5b] text-white">
      {bienvenida && (
        <BienvenidaDigital
          nombre={bienvenida.nombre}
          rol={bienvenida.rol}
          completa={bienvenida.completa}
          onTerminar={() => navigate('/')}
        />
      )}
      {/* ── Fondo ─────────────────────────────────────────────────────────── */}
      {/* Marco propio y recortado: en PC la foto es más ancha que la pantalla y, si
          desbordara el contenedor de la página, el navegador lo desplazaría de lado
          al enfocar un campo (overflow-x-hidden no impide ese desplazamiento). */}
      <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
      <picture>
        <source media="(max-width: 767px)" srcSet="/assets/images/login/fondo-movil.webp" />
        <img
          src="/assets/images/login/fondo.webp"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover object-[70%_center] blur-[2px] scale-105 md:blur-0 md:scale-100 lg:inset-auto lg:top-0 lg:h-full lg:w-auto lg:max-w-none lg:left-[calc(28%-22dvh)]"
        />
      </picture>
      </div>
      {/* Velos: en celular/tablet oscurecen toda la foto; en PC funden la franja azul con ella. */}
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-[#0b2a5b]/85 via-[#0b2a5b]/70 to-[#0b2a5b]/90 lg:hidden" />
      <div aria-hidden="true" className="hidden lg:block absolute inset-y-0 left-0 w-[40%] bg-gradient-to-r from-[#0b2a5b] from-[62%] to-transparent" />
      <div aria-hidden="true" className="hidden lg:block absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#0b2a5b]/80 to-transparent" />
      <div aria-hidden="true" className="hidden lg:block absolute right-0 bottom-0 h-24 w-[45%] bg-gradient-to-tl from-blue-500/70 via-blue-600/30 to-transparent [clip-path:polygon(100%_0,100%_100%,0_100%)]" />

      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-[1600px] flex-col lg:flex-row lg:items-stretch">
        {/* ── Mensaje de marca ──────────────────────────────────────────── */}
        <section className="flex flex-col items-center px-5 pt-8 sm:px-8 md:items-start md:pt-10 lg:w-[30%] lg:justify-center lg:px-12 lg:py-10">
          <TemplexLogo tono="blanco" className="h-12 w-fit md:h-14 lg:h-20" />
          <div className="mt-6 hidden md:block lg:mt-12">
            <h1 className="text-3xl font-semibold leading-tight lg:text-[2.1rem] xl:text-[2.5rem]">
              Tecnología que
              <span className="block font-extrabold text-sky-300">impulsa tus proyectos</span>
            </h1>
            <div className="mt-4 h-1 w-14 rounded-full bg-sky-400" />
            <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-white/90 lg:text-base">
              Sistema integral para la gestión de órdenes, producción, instalaciones y más.
            </p>
            <ul className="mt-7 hidden grid-cols-4 gap-3 md:grid md:max-w-xl">
              {MODULOS.map(({ icono: Icono, texto }) => (
                <li key={texto} className="flex flex-col gap-2 text-[12.5px] leading-snug text-white/90">
                  <Icono className="h-8 w-8 text-sky-200" weight="duotone" />
                  {texto}
                </li>
              ))}
            </ul>
            <p className="mt-10 hidden -rotate-6 text-2xl text-white/95 lg:block" style={{ fontFamily: FIRMA }}>
              ¡Juntos construimos
              <span className="block pl-8">mejores espacios!</span>
            </p>
          </div>
        </section>

        {/* Espacio del personaje en PC (la foto ya está de fondo). */}
        <div className="hidden lg:block lg:flex-1" />

        {/* ── Tarjeta de ingreso ──────────────────────────────────────────
            En PC va a la derecha del personaje (la foto se corre para que él quede
            entre el texto y la tarjeta); los sellos, en una fila bajo la tarjeta. */}
        <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 pb-6 pt-16 sm:px-8 md:pt-12 lg:w-[30%] lg:flex-none lg:items-end lg:py-10 lg:pl-0 lg:pr-10 xl:w-[27%] xl:pr-14">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="relative w-full max-w-[420px] rounded-3xl border border-white/60 bg-white/95 px-6 pb-7 pt-14 text-slate-900 shadow-2xl shadow-black/30 backdrop-blur-md sm:px-8 md:pt-10"
          >
            {/* Cara del personaje sobre la tarjeta: solo celular y tablet. */}
            <img
              src="/assets/images/login/avatar.webp"
              alt=""
              aria-hidden="true"
              width={88}
              height={88}
              className="absolute left-1/2 top-0 h-[88px] w-[88px] -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white object-cover shadow-lg md:hidden"
            />
            <div className="flex flex-col items-center text-center">
              <TemplexLogo className="h-14 w-auto sm:h-16" />
              <p className="mt-2 text-sm text-slate-600">Sistema Integral v2.1</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="mt-7 space-y-5" noValidate>
              <div>
                <label htmlFor="login-usuario" className="mb-1.5 block text-sm font-semibold text-slate-900">Usuario</label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                  <input
                    id="login-usuario"
                    {...register('username')}
                    type="text"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="Ingresa tu usuario"
                    aria-invalid={Boolean(errors.username)}
                    className={`${CAMPO} ${errors.username ? 'border-rose-400 focus:ring-rose-300' : 'border-slate-300 focus:ring-blue-500'}`}
                  />
                </div>
                {errors.username && <p className="mt-1 text-sm text-rose-600">{errors.username.message}</p>}
              </div>

              <div>
                <label htmlFor="login-clave" className="mb-1.5 block text-sm font-semibold text-slate-900">Contraseña</label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                  <input
                    id="login-clave"
                    {...register('password')}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    aria-invalid={Boolean(errors.password)}
                    className={`${CAMPO} pr-12 ${errors.password ? 'border-rose-400 focus:ring-rose-300' : 'border-slate-300 focus:ring-blue-500'}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    className="absolute right-1.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                {errors.password && <p className="mt-1 text-sm text-rose-600">{errors.password.message}</p>}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-blue-700 text-[15px] font-semibold text-white shadow-lg shadow-blue-600/30 transition hover:from-blue-600 hover:to-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <><ArrowRight className="h-5 w-5" /> Iniciar sesión</>}
              </button>
            </form>

            <div className="mt-6 flex items-center gap-3 text-[12.5px] text-slate-600">
              <span className="h-px flex-1 bg-slate-200" />
              <span className="flex items-center gap-1.5 whitespace-nowrap"><ShieldCheck className="h-4 w-4 text-blue-600" weight="fill" /> Sistema creado por <strong className="font-semibold text-slate-800">AlcaNET</strong></span>
              <span className="h-px flex-1 bg-slate-200" />
            </div>
          </motion.div>
          <ul className="hidden w-full max-w-[420px] grid-cols-4 overflow-hidden rounded-2xl bg-[#0b2a5b]/60 ring-1 ring-white/15 backdrop-blur-md xl:grid">
            {SELLOS.map(({ icono: Icono, texto }, i) => (
              <li key={texto} className={`flex flex-col items-center gap-1.5 px-2 py-3 text-center text-[11.5px] leading-tight text-white/95 ${i > 0 ? 'border-l border-white/20' : ''}`}>
                <Icono className="h-7 w-7 text-white" weight="duotone" />
                {texto}
              </li>
            ))}
          </ul>
        </main>

      </div>

      {/* Íconos de módulos en celular y tablet, y pie. */}
      <ul className="relative z-10 mx-auto grid max-w-md grid-cols-4 gap-2 px-5 pb-4 text-center text-[11px] leading-tight text-white/90 md:hidden">
        {MODULOS.map(({ icono: Icono, texto }) => (
          <li key={texto} className="flex flex-col items-center gap-1.5">
            <Icono className="h-6 w-6 text-sky-200" weight="duotone" />
            {texto}
          </li>
        ))}
      </ul>
      <footer className="relative z-10 pb-4 text-center text-[11.5px] text-white/80 lg:absolute lg:bottom-4 lg:right-10 lg:pb-0 lg:text-right">
        Vidrios Templex <span className="mx-1.5 text-white/50">|</span> Sistema Integral
      </footer>
    </div>
  );
};

export default LoginPage;
