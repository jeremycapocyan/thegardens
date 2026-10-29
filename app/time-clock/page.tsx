import type {Metadata} from 'next';
import EmployeeClock from './time-clock';
export const metadata:Metadata={title:'The Gardens | Employee Time Clock',robots:{index:false,follow:false},referrer:'no-referrer'};
export default function TimeClockPage(){return <EmployeeClock/>;}
