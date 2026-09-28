import { Framework } from '../../deidentify/catalog/frameworks';
import { l, Localized } from './localized';

/**
 * Location is generalized to the coarsest level each framework still treats
 * as useful: US states (HIPAA allows state), countries, UK nations/regions,
 * Swiss cantons. No city, street or postcode is ever generated.
 */
export const REGIONS: Record<Framework, Localized[]> = {
  [Framework.HIPAA]: [
    l('California', 'Каліфорнія'),
    l('Texas', 'Техас'),
    l('Florida', 'Флорида'),
    l('New York', 'Нью-Йорк'),
    l('Pennsylvania', 'Пенсильванія'),
    l('Illinois', 'Іллінойс'),
    l('Ohio', 'Огайо'),
    l('Georgia', 'Джорджія'),
    l('North Carolina', 'Північна Кароліна'),
    l('Michigan', 'Мічиган'),
    l('Washington', 'Вашингтон'),
    l('Arizona', 'Аризона'),
  ],
  [Framework.EU_GDPR]: [
    l('Germany', 'Німеччина'),
    l('France', 'Франція'),
    l('Italy', 'Італія'),
    l('Spain', 'Іспанія'),
    l('Poland', 'Польща'),
    l('Netherlands', 'Нідерланди'),
    l('Belgium', 'Бельгія'),
    l('Sweden', 'Швеція'),
    l('Austria', 'Австрія'),
    l('Czechia', 'Чехія'),
    l('Portugal', 'Португалія'),
    l('Ireland', 'Ірландія'),
  ],
  [Framework.UK_GDPR]: [
    l('London', 'Лондон'),
    l('South East England', 'Південно-Східна Англія'),
    l('North West England', 'Північно-Західна Англія'),
    l('Midlands', 'Мідлендс'),
    l('North East and Yorkshire', 'Північно-Східна Англія та Йоркшир'),
    l('South West England', 'Південно-Західна Англія'),
    l('Scotland', 'Шотландія'),
    l('Wales', 'Уельс'),
    l('Northern Ireland', 'Північна Ірландія'),
  ],
  [Framework.SWISS_FADP]: [
    l('Zurich', 'Цюрих'),
    l('Bern', 'Берн'),
    l('Vaud', 'Во'),
    l('Geneva', 'Женева'),
    l('Aargau', 'Ааргау'),
    l('St. Gallen', 'Санкт-Галлен'),
    l('Lucerne', 'Люцерн'),
    l('Ticino', 'Тічино'),
    l('Valais', 'Вале'),
    l('Basel-Stadt', 'Базель-Штадт'),
  ],
};

/** Ten-year bands; everyone 90 or older shares one band (HIPAA Safe Harbor). */
export function ageBand(age: number): string {
  if (age >= 90) return '90+';
  if (age < 25) return '18-24';
  const start = Math.floor((age - 5) / 10) * 10 + 5;
  return `${start}-${Math.min(start + 9, 89)}`;
}
