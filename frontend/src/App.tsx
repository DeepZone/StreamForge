import {Routes,Route,Link} from 'react-router-dom';
const P=({t}:{t:string})=><div className='p-6'><h1 className='text-2xl'>{t}</h1></div>;
export default function App(){return <div><nav className='p-2 bg-slate-900'><Link to='/login'>Login</Link></nav><Routes><Route path='*' element={<P t='StreamForge Dashboard'/>}/></Routes></div>}
