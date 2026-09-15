import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { PetWindow } from './PetWindow';
import './styles.css';

const petWindow=new URLSearchParams(location.search).get('pet')==='true';
document.documentElement.classList.toggle('pet-mode',petWindow);
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>{petWindow?<PetWindow/>:<App/>}</React.StrictMode>);
