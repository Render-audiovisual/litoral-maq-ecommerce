import { describe, expect, it } from "vitest";
import {
  buildShipmentXml,
  clean,
  nextPickupDate,
  parseBranches,
  parseCancel,
  parseCreated,
  parseTariffs,
  parseTracking,
  provinceName,
} from "../../../supabase/functions/_shared/shipping/oca-xml";

// Fragmentos reales devueltos por el ambiente QA de OCA el 2026-10-22.
const TARIFA = `<DataSet xmlns="#Oca_e_Pak"><diffgr:diffgram><NewDataSet xmlns="">
<Table diffgr:id="Table1" msdata:rowOrder="0"><Tarifador>15</Tarifador><Precio>181.9200</Precio>
<idTiposervicio>5</idTiposervicio><Ambito>Principales</Ambito><PlazoEntrega>1</PlazoEntrega>
<Adicional>0.0000</Adicional><Total>181.9200</Total><XML>&lt;row Tarifador="15"/&gt;</XML></Table>
</NewDataSet></diffgr:diffgram></DataSet>`;

const CENTROS = `<CentrosDeImposicion>
<Centro><IdCentroImposicion>18</IdCentroImposicion><Sucursal>SUCURSAL OCA - PALERMO</Sucursal>
<Calle>GODOY CRUZ</Calle><Numero>2746</Numero><Piso>
</Piso><Localidad>CAPITAL FEDERAL          </Localidad>
<Servicios><Servicio><IdTipoServicio>1</IdTipoServicio></Servicio><Servicio><IdTipoServicio>2</IdTipoServicio></Servicio></Servicios></Centro>
<Centro><IdCentroImposicion>99</IdCentroImposicion><Sucursal>SOLO ADMISION</Sucursal><Calle>X</Calle><Numero>1</Numero>
<Localidad>Y</Localidad><Servicios><Servicio><IdTipoServicio>1</IdTipoServicio></Servicio></Servicios></Centro>
</CentrosDeImposicion>`;

const INGRESO = `<DataSet><diffgr:diffgram><Resultado xmlns="">
<Resumen diffgr:id="Resumen1"><CodigoOperacion>12364087</CodigoOperacion><CantidadRechazados>0</CantidadRechazados></Resumen>
<DetalleIngresos diffgr:id="DetalleIngresos1"><Operativa>64665</Operativa><OrdenRetiro>20916072</OrdenRetiro>
<NumeroEnvio>1217400000000344527</NumeroEnvio><Remito>LM-TEST4</Remito><Estado>OR Pendiente de Impresion</Estado></DetalleIngresos>
</Resultado></diffgr:diffgram></DataSet>`;

const TRACKING = `<NewDataSet xmlns=""><Table><NumeroEnvio>1</NumeroEnvio>
<Desdcripcion_Estado>En proceso de Retiro - Suc: PLANTA VELEZ SARSFIELD</Desdcripcion_Estado>
<fecha>2026-10-22 14:39:29.790</fecha></Table>
<Table><Desdcripcion_Estado>Ingresado</Desdcripcion_Estado><fecha>2026-10-21 10:00:00.000</fecha></Table></NewDataSet>`;

describe("OCA ePak: parseo de respuestas reales", () => {
  it("lee tarifa y plazo", () => {
    expect(parseTariffs(TARIFA)).toEqual([{ amount: 181.92, days: 1 }]);
    expect(parseTariffs("<NewDataSet xmlns=\"\"></NewDataSet>")).toEqual([]);
  });

  it("lista sucursales y marca las que entregan paquetes", () => {
    const branches = parseBranches(CENTROS);
    expect(branches).toHaveLength(2);
    expect(branches[0]).toMatchObject({
      id: "18",
      name: "SUCURSAL OCA - PALERMO",
      address: "GODOY CRUZ 2746, CAPITAL FEDERAL",
      acceptsDelivery: true,
    });
    expect(branches[1].acceptsDelivery).toBe(false);
  });

  it("lee orden de retiro y número de envío", () => {
    expect(parseCreated(INGRESO)).toEqual({
      orderId: "20916072",
      shipmentId: "1217400000000344527",
      state: "OR Pendiente de Impresion",
      rejected: 0,
    });
    expect(parseCreated("<DataSet></DataSet>")).toBeNull();
  });

  it("ordena el seguimiento por fecha y tolera el tag mal escrito de OCA", () => {
    const events = parseTracking(TRACKING);
    expect(events.map((event) => event.message)).toEqual([
      "Ingresado",
      "En proceso de Retiro - Suc: PLANTA VELEZ SARSFIELD",
    ]);
  });

  it("interpreta la anulación", () => {
    const xml = "<Table><IdResult>130</IdResult><Mensaje>La Orden no puede ser Anulada.</Mensaje></Table>";
    expect(parseCancel(xml)).toEqual({ code: 130, message: "La Orden no puede ser Anulada." });
  });
});

describe("OCA ePak: armado del envío", () => {
  const input = {
    account: "111757/001",
    operativa: "64665",
    costCenter: "1",
    pickupDate: "20261030",
    pickupSlot: "1",
    remito: "LM-ABC123",
    origin: {
      street: "Sáenz",
      number: "1587",
      postalCode: "3400",
      locality: "Corrientes",
      province: "Corrientes",
      contact: "Litoral Maq",
      email: "maqlitoral@gmail.com",
    },
    recipient: {
      lastName: "Pérez & Hijos",
      firstName: "Juan",
      street: "Godoy Cruz",
      number: "2746",
      floor: "",
      apartment: "",
      postalCode: "1425",
      locality: "Capital Federal",
      province: "Capital Federal",
      phone: "3794009782",
      email: "a@b.com",
      notes: "",
      branchId: "0",
    },
    packages: [{ heightCm: 10, widthCm: 20, lengthCm: 30, weightKg: 1.5, declaredValue: 0 }],
  };

  it("genera el XML con los atributos que exige OCA", () => {
    const xml = buildShipmentXml(input);
    expect(xml).toContain('nrocuenta="111757/001"');
    expect(xml).toContain('idoperativa="64665" nroremito="LM-ABC123"');
    expect(xml).toContain('<paquete alto="10.00" ancho="20.00" largo="30.00" peso="1.50" valor="0.00" cant="1" />');
    expect(xml).toContain('calle="Saenz"'); // sin tildes
    expect(xml).toContain('apellido="Perez Hijos"'); // sin & que rompa el XML
  });

  it("limpia caracteres no admitidos y recorta al largo permitido", () => {
    expect(clean('A|B&C<D>"E"', 30)).toBe("A B C D E");
    expect(clean("x".repeat(50), 30)).toHaveLength(30);
  });
});

describe("OCA ePak: helpers", () => {
  it("salta fines de semana para el retiro (hora Argentina)", () => {
    // Viernes 2026-10-23 15:00 UTC → próximo hábil: lunes 26.
    expect(nextPickupDate(new Date("2026-10-23T15:00:00Z"))).toBe("20261026");
    // Martes → miércoles.
    expect(nextPickupDate(new Date("2026-10-20T15:00:00Z"))).toBe("20261021");
  });

  it("traduce códigos de provincia", () => {
    expect(provinceName("W")).toBe("Corrientes");
    expect(provinceName("c")).toBe("Capital Federal");
  });
});
