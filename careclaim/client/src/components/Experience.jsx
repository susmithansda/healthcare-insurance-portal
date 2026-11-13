import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, FileText, Headphones, Pause, Play, ShieldCheck, Sparkles } from 'lucide-react';
import './Experience.css';

const steps = [
  { name: 'Submit', title: 'Start with the essentials.', description: 'Add your treatment details, select your policy, and attach bills in one organized claim.', icon: FileText },
  { name: 'Track', title: 'Know where things stand.', description: 'A clear timeline brings submission, document checks, and the final decision into view.', icon: ShieldCheck },
  { name: 'Pay', title: 'Keep the details together.', description: 'Manage policy premiums and download receipts. Sandbox payments let you explore without moving money.', icon: Check },
];

export default function Experience() {
  const [selected, setSelected] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [audioError, setAudioError] = useState('');
  const audioRef = useRef(null);
  const step = steps[selected];
  const Icon = step.icon;

  function navigateSteps(event, index) {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % steps.length;
    else if (event.key === 'ArrowLeft') next = (index + steps.length - 1) % steps.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = steps.length - 1;
    else return;
    event.preventDefault();
    setSelected(next);
    document.getElementById(`journey-tab-${next}`)?.focus();
  }

  useEffect(() => {
    const audio = audioRef.current;
    const start = () => { if(audio) { audio.volume=.3; audio.play().then(()=>setPlaying(true)).catch(()=>setAudioError('Music starts after your first interaction.')); } };
    start(); document.addEventListener('pointerdown',start,{once:true}); document.addEventListener('keydown',start,{once:true});
    const observer = new IntersectionObserver(entries => entries.forEach(entry => { if(entry.isIntersecting) entry.target.classList.add('revealed'); }),{threshold:.12});
    document.querySelectorAll('.experience-cinema,.experience-guide,.experience-music').forEach(el=>{el.classList.add('scroll-reveal');observer.observe(el)});
    return ()=>{audio?.pause();observer.disconnect();document.removeEventListener('pointerdown',start);document.removeEventListener('keydown',start)};
  }, []);

  return <div className="experience-page">
    <div className="experience-heading">
      <span className="experience-eyebrow"><Sparkles size={15} aria-hidden="true" /> THE CARECLAIM EXPERIENCE</span>
      <h2>A little clarity.<br /><em>A little calm.</em></h2>
      <p>A quick tour of your care companion, with a quiet moment when you need one.</p>
    </div>

    <section className="experience-cinema" aria-labelledby="experience-film-title">
      <div className="experience-film-label"><span className="experience-dot" /><span id="experience-film-title">Your journey, made simpler</span><span>16 SEC</span></div>
      <video className="experience-video" autoPlay muted loop playsInline preload="metadata" poster="/media/walkthrough-poster.webp" aria-label="A sixteen second animated introduction to submitting, tracking, paying for, and understanding claims">
        <source src="/media/careclaim-walkthrough.mp4" type="video/mp4" />
        <track kind="captions" src="/media/walkthrough.en.vtt" srcLang="en" label="English" default />
        Your browser does not support this video. The steps below describe the walkthrough.
      </video>
      <p className="experience-caption">An original animated walkthrough. All names, claims, and payments shown are sample data.</p>
    </section>

    <div className="experience-lower">
      <section className="experience-guide" aria-labelledby="experience-guide-title">
        <span className="experience-eyebrow">THREE SIMPLE STEPS</span>
        <h3 id="experience-guide-title">Care, without the chaos.</h3>
        <div className="experience-tabs" role="tablist" aria-label="Claim journey">
          {steps.map((item, index) => <button key={item.name} type="button" role="tab" id={`journey-tab-${index}`} aria-selected={selected === index} aria-controls="journey-panel" tabIndex={selected === index ? 0 : -1} onKeyDown={(event) => navigateSteps(event, index)} onClick={() => setSelected(index)} className={selected === index ? 'is-active' : ''}><span>0{index + 1}</span>{item.name}</button>)}
        </div>
        <div id="journey-panel" role="tabpanel" aria-labelledby={`journey-tab-${selected}`} className="experience-step" key={selected}>
          <div className="experience-step-icon"><Icon size={24} aria-hidden="true" /></div>
          <div><h4>{step.title}</h4><p>{step.description}</p></div>
          <ArrowRight size={19} aria-hidden="true" />
        </div>
      </section>

      <section className="experience-music" aria-labelledby="experience-music-title">
        <div className="experience-music-top"><span className="experience-music-icon"><Headphones size={23} aria-hidden="true" /></span><span className="experience-original">ORIGINAL SOUND</span></div>
        <h3 id="experience-music-title">A moment to breathe.</h3>
        <p>A gentle instrumental loop, composed for this space. Music begins automatically when your browser allows playback.</p>
        <div className={`experience-wave ${playing ? 'is-playing' : ''}`} aria-hidden="true">{Array.from({ length: 28 }, (_, i) => <span key={i} style={{ '--bar-height': `${12 + ((i * 13 + 7) % 31)}px`, '--bar-delay': `${i * -0.11}s` }} />)}</div>
        <audio ref={audioRef} src="/media/careclaim-calm.wav" preload="auto" autoPlay loop onPause={() => setPlaying(false)} />
        {audioError && <p className="experience-audio-error" role="status">{audioError}</p>}
      </section>
    </div>
  </div>;
}
