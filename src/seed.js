export const defaultDepartments=['Körsbäret','Päronet','Äpplet'];
const names=['Alva','Noah','Elias','Maja','Leo','Ella','Sam','Iris','Otto','Lilly','Milo','Freja','Elsa','Hugo','Astrid','Nils','Selma','Adam','Signe','Isak','Alice','Axel','Saga','Alfred','Vera','Olle','Ebba','Liam','Ines','Theo','Agnes','Vidar','Ester','Oscar','Siri','Arvid','Liv','Felix','Edith','Vilgot'];
const surnames=['Björk','Lind','Ek','Asp','Alm','Rönn','Hassel','Lönn','Gran','Tall','Sälg','Vide','Berg','Dahl','Lund','Holm','Strand','Nyberg','Sjöberg','Sand','Lindberg','Ekström','Bergman','Fors','Westin','Åberg','Norén','Sund','Hedin','Rosén','Hall','Blom','Vik','Eng','Löf','Hult','Sjölin','Broman','Lidén','Falk'];
const siblings=['Lova','Malte','Meja','Ture','Lo','Ebbe','Minna','Sixten'];
// Fictional households: stable names make manual testing and history easy to follow.
export const demoFamilies=names.map((name,index)=>{
  const childRecords=[name,...(index%5===0?[siblings[Math.floor(index/5)]]:[])].map(name=>({name,start:'',end:'',exemptionWeeks:4}));
  return {id:index+1,name:surnames[index],children:new Intl.ListFormat('sv',{type:'conjunction'}).format(childRecords.map(c=>c.name)),childRecords,group:defaultDepartments[index%3],status:index<35?'Aktiv':'Jourbefriad',blockedWeekdays:index<35&&index%5===0?[5]:[],demo:true};
});
