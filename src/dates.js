export const isoDate = date => date.toISOString().slice(0, 10);
export const utcDate = value => new Date(`${value}T00:00:00Z`);
export const addDays = (value, count) => { const date=utcDate(value);date.setUTCDate(date.getUTCDate()+count);return isoDate(date); };
export const validDate = value => typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && isoDate(utcDate(value))===value;
export const within = (date, ranges=[]) => ranges.some(range=>date>=range.start&&date<=range.end);
export function datesBetween(start,end) {
  const result=[];for(let date=start;date<=end;date=addDays(date,1)) result.push(date);return result;
}
export function swedishHolidays(year) {
  // Gregorian Easter (Meeus/Jones/Butcher); all arithmetic is UTC.
  const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4;
  const f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30;
  const i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
  const month=Math.floor((h+l-7*m+114)/31),day=(h+l-7*m+114)%31+1;
  const easter=isoDate(new Date(Date.UTC(year,month-1,day)));
  const fixed={'01-01':'Nyårsdagen','01-06':'Trettondedag jul','05-01':'Första maj','06-06':'Nationaldagen','12-25':'Juldagen','12-26':'Annandag jul'};
  const result=Object.fromEntries(Object.entries(fixed).map(([date,name])=>[`${year}-${date}`,name]));
  for(const [offset,name] of [[-2,'Långfredagen'],[0,'Påskdagen'],[1,'Annandag påsk'],[39,'Kristi himmelsfärdsdag'],[49,'Pingstdagen']]) result[addDays(easter,offset)]=name;
  const saturday=(month,first)=>{let date=`${year}-${month}-${first}`;while(utcDate(date).getUTCDay()!==6) date=addDays(date,1);return date;};
  result[saturday('06','20')]='Midsommardagen';result[saturday('10','31')]='Alla helgons dag';
  return result;
}
export function swedishEves(year) {
  const holidays=swedishHolidays(year);
  const midsummer=Object.keys(holidays).find(date=>holidays[date]==='Midsommardagen');
  return {[`${year}-12-24`]:'Julafton',[`${year}-12-31`]:'Nyårsafton',[addDays(midsummer,-1)]:'Midsommarafton',...Object.fromEntries(Object.entries(holidays).filter(([,name])=>name==='Påskdagen').map(([date])=>[addDays(date,-1),'Påskafton']))};
}
export function holidayMap(start,end,includeEves=true) {
  const result={};for(let year=Number(start.slice(0,4))-1;year<=Number(end.slice(0,4))+1;year++) Object.assign(result,swedishHolidays(year),includeEves?swedishEves(year):{});return Object.fromEntries(Object.entries(result).filter(([,name])=>name));
}
