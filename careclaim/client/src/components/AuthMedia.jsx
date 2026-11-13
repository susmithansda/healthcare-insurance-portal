import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, HeartPulse, Pause, Play, ShieldCheck, Stethoscope, Volume2, VolumeX } from 'lucide-react';
import './AuthMedia.css';

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function AuthMedia({ photoSrc = '/media/doctor-patient.jpg' }) {
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  const [animationEnabled, setAnimationEnabled] = useState(() => !prefersReducedMotion());
  const [pageHidden, setPageHidden] = useState(() => document.hidden);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioMessage, setAudioMessage] = useState('A gentle soundtrack for your visit.');
  const [photoError, setPhotoError] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const mounted = useRef(false);
  const audioPreference = useRef(prefersReducedMotion() ? 'off' : 'auto');
  const audioAttempt = useRef(0);
  const videoAttempt = useRef(0);
  const animationWanted = useRef(animationEnabled);
  const animated = animationEnabled && !pageHidden;

  async function startAudio() {
    const audio = audioRef.current;
    if (!audio || audioPreference.current === 'off' || document.hidden) return;
    const attempt = ++audioAttempt.current;
    audio.volume = .14;
    audio.muted = false;
    try {
      await audio.play();
      if (attempt !== audioAttempt.current || !mounted.current) return;
      if (audioPreference.current === 'off' || document.hidden) { audio.pause(); return; }
      setAudioPlaying(true);
      setAudioMessage('A gentle welcome, with sound.');
    } catch (error) {
      if (attempt !== audioAttempt.current || !mounted.current) return;
      setAudioPlaying(false);
      if (error.name !== 'AbortError') {
        audioPreference.current = 'off';
        setAudioMessage(error.name === 'NotAllowedError' ? 'Enable sound whenever you’re ready.' : 'Welcome audio is unavailable.');
      }
    }
  }

  function stopAudio() {
    audioPreference.current = 'off';
    ++audioAttempt.current;
    if (audioRef.current) { audioRef.current.muted = true; audioRef.current.pause(); }
    setAudioPlaying(false);
    setAudioMessage('Sound is off. Enjoy a quieter welcome.');
  }

  function toggleAudio() {
    if (audioPlaying || audioPreference.current === 'on') stopAudio();
    else { audioPreference.current = 'on'; startAudio(); }
  }

  useEffect(() => {
    mounted.current = true;
    const audio = audioRef.current;
    if (!reducedMotion && audioPreference.current !== 'off') startAudio();
    else if (reducedMotion) setAudioMessage('Animation and sound start only when you choose.');
    return () => {
      mounted.current = false;
      ++audioAttempt.current;
      audio?.pause();
    };
  }, []);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const changed = event => {
      setReducedMotion(event.matches);
      if (event.matches) {
        animationWanted.current = false;
        setAnimationEnabled(false);
        videoRef.current?.pause();
        stopAudio();
        setAudioMessage('Animation and sound start only when you choose.');
      }
    };
    preference.addEventListener('change', changed);
    return () => preference.removeEventListener('change', changed);
  }, []);

  useEffect(() => {
    animationWanted.current = animationEnabled;
    const video = videoRef.current;
    if (!video) return;
    const attempt = ++videoAttempt.current;
    if (!animated) { video.pause(); return; }
    video.play().catch(error => {
      if (attempt === videoAttempt.current && error.name !== 'AbortError' && mounted.current && animationWanted.current && !document.hidden) setAnimationEnabled(false);
    });
    return () => { ++videoAttempt.current; video.pause(); };
  }, [animated, videoError]);

  useEffect(() => {
    const changed = () => {
      setPageHidden(document.hidden);
      if (document.hidden) {
        ++audioAttempt.current;
        audioRef.current?.pause();
        videoRef.current?.pause();
      } else if (audioPreference.current !== 'off') startAudio();
    };
    document.addEventListener('visibilitychange', changed);
    return () => document.removeEventListener('visibilitychange', changed);
  }, []);

  return <section className={`auth-media ${animated ? 'is-animated' : 'is-paused'}`} aria-label="A welcome to your care workspace">
    <div className="auth-media-portrait">
      {!photoError ? <img className="auth-media-photo" src={photoSrc} alt="A doctor and patient talking together during a friendly consultation" width="1536" height="1024" fetchPriority="high" onError={() => setPhotoError(true)} /> : <div className="auth-media-photo-fallback"><Stethoscope size={48} strokeWidth={1.1} /><strong>Care built around you.</strong><span>Your cover. Your clarity. Your peace of mind.</span></div>}
      <span className="auth-media-photo-tag"><span /><HeartPulse size={14} />People-first care</span>
      <div className="auth-media-photo-caption"><span className="auth-media-caption-icon"><ShieldCheck size={22} /></span><div><strong>A clearer path, together.</strong><span>Here for the person behind every claim.</span></div><span className="auth-media-check"><Check size={15} /></span></div>
      <div className="auth-media-orbit" aria-hidden="true"><HeartPulse size={19} /></div>
    </div>

    <div className="auth-media-film">
      <div className="auth-media-film-frame">
        {!videoError ? <video ref={videoRef} className="auth-welcome-video" autoPlay={animationEnabled && !reducedMotion} muted loop playsInline preload="auto" poster="/media/walkthrough-poster.webp" aria-label="CareClaim animated welcome walkthrough" onError={() => setVideoError(true)}>
          <source src="/media/careclaim-walkthrough.mp4" type="video/mp4" />
          <track kind="captions" src="/media/walkthrough.en.vtt" srcLang="en" label="English" default />
        </video> : <div className="auth-media-film-fallback"><HeartPulse size={28} /><span>Your care journey</span></div>}
        <span className="auth-media-film-duration">16 SEC</span>
      </div>
      <div className="auth-media-film-copy"><span className="auth-media-film-eyebrow"><span />A LITTLE CLARITY, IN MOTION</span><strong>Your care journey, made simple.</strong><p>Submit. Follow your progress. Stay covered.</p><span className="auth-media-film-link">One less thing to worry about <ArrowRight size={13} /></span></div>
    </div>

    <div className="auth-media-controls">
      <button type="button" className="auth-media-control" onClick={toggleAudio} aria-label={audioPlaying ? 'Mute welcome audio' : 'Enable welcome audio'} aria-pressed={audioPlaying}>{audioPlaying ? <Volume2 size={15} /> : <VolumeX size={15} />}<span>{audioPlaying ? 'Sound on' : 'Enable sound'}</span>{audioPlaying && <span className="auth-media-sound-wave" aria-hidden="true"><i /><i /><i /></span>}</button>
      <button type="button" className="auth-media-control" onClick={() => setAnimationEnabled(value => !value)} aria-label={animationEnabled ? 'Pause welcome animation' : 'Play welcome animation'} aria-pressed={animationEnabled}>{animationEnabled ? <Pause size={14} /> : <Play size={14} />}<span>{animationEnabled ? 'Pause animation' : 'Play animation'}</span></button>
    </div>
    <p className="auth-media-audio-message" role="status">{audioMessage}</p>
    <audio ref={audioRef} src="/media/careclaim-calm.wav" preload="metadata" loop onPlay={() => { if (audioPreference.current === 'off') audioRef.current?.pause(); else setAudioPlaying(true); }} onPause={() => setAudioPlaying(false)} onError={() => { setAudioPlaying(false); setAudioMessage('Welcome audio is unavailable.'); }} />
  </section>;
}
